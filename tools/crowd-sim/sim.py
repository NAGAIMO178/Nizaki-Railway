# 混雑予報(仮)のシミュレーター。仮想の住民を、実際のダイヤ(public/data/dia-2)の上で動かして、
# 列車ごと(区間ごと)の混雑レベル(1〜6)を、public/data/crowd-2/ に書き出す。
# 計算はこの Mac で1回だけ(アプリは、できた JSON を読むだけ)。
#   使い方:  python3 tools/crowd-sim/sim.py        (標準ライブラリだけ。数分)
import bisect, csv, collections, json, math, os, random, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DIA = os.path.join(ROOT, "public", "data", "dia-2")
OUT = os.path.join(ROOT, "public", "data", "crowd-2")

# ---------------- 設定(結果を見て調整する数字) ----------------
N_AGENTS = int(os.environ.get("N_AGENTS", 60000))   # 仮想住民の数(1人が、何人分かは、乗降客数に合わせて自動で決める)
SEED = 20261101
DEMAND = float(os.environ.get("DEMAND", 2.0))   # 乗降客数の倍率(列車の数に対する、混み具合の調整)
STATIONS_FILE = os.environ.get("STATIONS", "stations.csv")   # 乗降客数の表(stations.csv=中堅級 / stations_large.csv=大手級)
MIN_TRANSFER = 150          # 乗換に要する最小の秒数
HORIZON = 3 * 3600 + 1800   # 1回の探索で、先を見る時間
BUCKET = 60                 # 出発時刻のまとめ(秒)。同じ駅・同じ1分は、同じ探索結果を使う
VARIANTS = 5               # 住民の「好み」の種類。列車ごとに、種類ごとに、±NOISE_SEC の、感じ方のずれを付ける
NOISE_SEC = 180             # 感じ方のずれ(秒)。同じような列車に、住民が分かれて乗るようにする(いちばん早い列車だけに、全員が乗らない)
SMOOTH_SEC = 300            # 前後の列車と、混雑をならすときの、時間の幅(秒)
SMOOTH_SELF = 0.5           # ならしたあとも、自分の値を残す割合
PREMIUM_RATE = 0.15         # 有料特急を使ってよい住民の割合
TAU = 40 * 60               # 行き先を選ぶときの、所要時間の「遠さ」の目安(秒)
IPF_ROUNDS = int(os.environ.get("IPF_ROUNDS", 6))
WEEKDAYS, WEEKENDS = 5, 2   # 平日5日・土休日2日を動かして、日ごとの平均を取る
CAR_CAP = 135               # 通勤型1両の定員(=乗車率100%)
PAID_CAR_CAP = 80           # 有料特急1両の座席数ほぼ
# 混雑レベルのしきい値(乗車率%の上限)。レベル6は、それを超えるもの
LEVELS = [50, 100, 150, 180, 200]

# 駅の「格」ごとの、住む人・働く人・遊びに行く人の、相対的な多さ
RES = {"巨大ターミナル": 0.15, "主要乗換駅": 0.5, "準主要駅": 1.0, "一般駅": 1.3, "小さな駅": 1.5}
BIZ = {"巨大ターミナル": 3.0, "主要乗換駅": 1.5, "準主要駅": 0.8, "一般駅": 0.4, "小さな駅": 0.2}
LEI = {"巨大ターミナル": 2.5, "主要乗換駅": 1.5, "準主要駅": 1.0, "一般駅": 0.6, "小さな駅": 0.4}
TOURIST = {"茨城空港": 4, "大洗": 4, "ひたちなか海浜公園": 5, "浅草": 3, "那珂湊": 3, "平磯": 3, "日立": 1.5, "越谷レイクタウン": 2}


def load():
    master = json.load(open(os.path.join(DIA, "master.json"), encoding="utf-8"))
    trains = {c: json.load(open(os.path.join(DIA, f"{c}_trains.json"), encoding="utf-8")) for c in master}
    rows = list(csv.DictReader(open(os.path.join(HERE, STATIONS_FILE), encoding="utf-8-sig")))
    man = "1日の乗降客数(万人・概算)"
    st = {r["駅"]: dict(target=float(r[man]) * 10000 * DEMAND, tier=r["格"]) for r in rows}
    return master, trains, st


def build(master, trains, st):
    """全列車を「つながり(connection)」にする。駅は、駅名で1つにまとめる(乗換駅は、路線をまたぐ)。
    直通の列車(同じ列車番号が、2つの路線にある)は、2つの部分を、1本の列車につなぐ(乗り通す住民が、乗換なしで、路線をまたげる)。"""
    names = sorted(st)
    sid = {n: i for i, n in enumerate(names)}

    def read(c, t):
        no, ty, d, run, t0, a = t[:6]   # 7つ目以降(運行番号・行先・始発)は、混雑には使わない
        m = master[c]
        nm, paid = m["types"][ty][0], m["types"][ty][2]
        stops, arr, dep = [], [], []
        for k in range(0, len(a), 3):
            stops.append(sid[m["stations"][a[k]][0]])
            arr.append(t0 + a[k + 1] if a[k + 1] >= 0 else None)
            dep.append(t0 + a[k + 2] if a[k + 2] >= 0 else None)
        return dict(line=c, no=no, dir=d, type=nm, paid=bool(paid), t0=t0, stops=stops, arr=arr, dep=dep)

    parts = collections.defaultdict(list)   # 列車番号 -> 路線ごとの部分
    for c, tl in trains.items():
        for t in tl:
            parts[t[0]].append(read(c, t))

    def join(ps):
        """直通: 早く始まる部分のあとに、次の部分をつなぐ。接続の駅は、前の部分の着と、後の部分の発を、1つにまとめる。"""
        a, b = sorted(ps, key=lambda p: p["t0"])
        assert a["stops"][-1] == b["stops"][0], f"直通のつながりが合わない: {a['no']}"
        stops = a["stops"] + b["stops"][1:]
        arr = a["arr"] + b["arr"][1:]
        dep = a["dep"][:-1] + [b["dep"][0]] + b["dep"][1:]
        return dict(type=a["type"], paid=a["paid"], line=a["line"], no=a["no"], dir=a["dir"], stops=stops, arr=arr, dep=dep,
                    seg_line=[a["line"]] * (len(a["stops"]) - 1) + [b["line"]] * (len(b["stops"]) - 1),
                    seg_dir=[a["dir"]] * (len(a["stops"]) - 1) + [b["dir"]] * (len(b["stops"]) - 1),
                    parts=[(a["line"], a["no"], len(a["stops"]) - 1), (b["line"], b["no"], len(b["stops"]) - 1)])

    T = []   # 列車: dict(line, no, type, paid, cap, stops=[駅番号...], arr=[...], dep=[...], seg_line, seg_dir, parts)
    conns = []
    done = set()
    for c, tl in trains.items():
        for t in tl:
            no = t[0]
            if (c, no) in done:
                continue
            ps = parts[no]
            if len(ps) == 2 and ps[0]["line"] != ps[1]["line"]:
                tr = join(ps)
                done.update((p["line"], no) for p in ps)
            else:
                p = next(x for x in ps if x["line"] == c)
                n = len(p["stops"]) - 1
                tr = dict(type=p["type"], paid=p["paid"], line=c, no=no, dir=p["dir"], stops=p["stops"], arr=p["arr"], dep=p["dep"],
                          seg_line=[c] * n, seg_dir=[p["dir"]] * n, parts=[(c, no, n)])
                done.add((c, no))
            cars = 10 if ("特急" in tr["type"] or tr["type"].startswith("特別快速")) else 8
            tr["cap"] = cars * (PAID_CAR_CAP if tr["paid"] else CAR_CAP)
            ti = len(T)
            T.append(tr)
            for k in range(len(tr["stops"]) - 1):
                conns.append((tr["dep"][k], tr["arr"][k + 1], tr["stops"][k], tr["stops"][k + 1], ti, k))
    conns.sort()
    return names, sid, T, conns


class Router:
    def __init__(self, nS, T, conns):
        self.nS, self.T = nS, T
        self.dep = [c[0] for c in conns]
        self.arr = [c[1] for c in conns]
        self.frm = [c[2] for c in conns]
        self.to = [c[3] for c in conns]
        self.trip = [c[4] for c in conns]
        self.seg = [c[5] for c in conns]
        self.paid = [T[c[4]]["paid"] for c in conns]
        self.cache = {}
        rng = random.Random(SEED + 7)
        self.noise = [[rng.uniform(-NOISE_SEC, NOISE_SEC) for _ in T] for _ in range(VARIANTS)]

    def scan(self, origin, t0, premium, var):
        key = (origin, t0, premium, var)
        r = self.cache.get(key)
        if r is not None:
            return r
        INF = 10 ** 9
        earliest = [INF] * self.nS      # 本当の到着時刻(乗換できるかの判定に使う)
        earliest[origin] = t0
        perceived = [INF] * self.nS     # この住民が、感じている到着時刻(どの列車を選ぶかに使う)
        perceived[origin] = t0
        nz = self.noise[var]
        parent = [None] * self.nS
        boarded = {}
        dep, arr, frm, to, trip, paid = self.dep, self.arr, self.frm, self.to, self.trip, self.paid
        i = bisect.bisect_left(dep, t0)
        lim = t0 + HORIZON
        n = len(dep)
        mt = MIN_TRANSFER
        while i < n and dep[i] <= lim:
            tr = trip[i]
            if premium or not paid[i]:
                b = boarded.get(tr)
                if b is None:
                    f = frm[i]
                    if f == origin or earliest[f] + mt <= dep[i]:
                        boarded[tr] = b = i
                if b is not None:
                    d = to[i]
                    pa = arr[i] + nz[tr]
                    if pa < perceived[d]:
                        perceived[d] = pa
                        earliest[d] = arr[i]
                        parent[d] = (i, b)
            i += 1
        self.cache[key] = r = (earliest, parent)
        return r

    def legs(self, origin, dest, t0, premium, var):
        earliest, parent = self.scan(origin, t0, premium, var)
        if parent[dest] is None:
            return None
        out, s, guard = [], dest, 0
        while s != origin and guard < 12:
            p = parent[s]
            if p is None:
                return None
            c, e = p
            out.append((self.trip[c], self.seg[e], self.seg[c], self.frm[e], self.to[c]))
            s = self.frm[e]
            guard += 1
        return out if s == origin else None


def hhmm(sec):
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}"


def sample_time(rng, mu, sd, lo, hi):
    while True:
        x = rng.gauss(mu, sd)
        if lo <= x <= hi:
            return int(x)


def make_agents(rng, names, st, mh, mw):
    """仮想住民。それぞれが、自宅(H)・勤め先(W)・ふだんの出発時刻のくせを持つ。"""
    nS = len(names)
    tier = [st[n]["tier"] for n in names]
    B = [st[n]["target"] / 2 for n in names]
    res = [B[i] * RES[tier[i]] * mh[i] for i in range(nS)]
    biz = [B[i] * BIZ[tier[i]] * mw[i] for i in range(nS)]
    lei = [B[i] * LEI[tier[i]] * TOURIST.get(names[i], 1) for i in range(nS)]
    homes = rng.choices(range(nS), weights=res, k=N_AGENTS)
    agents = []
    for h in homes:
        kind = rng.random()
        a = dict(home=h, premium=rng.random() < PREMIUM_RATE, var=rng.randrange(VARIANTS))
        # 勤め先・遊び先は、自宅から離れすぎないよう、自宅以外から、重みで選ぶ(近さは、探索の結果で、あとから効かせる)
        w = rng.choices(range(nS), weights=biz, k=1)[0]
        while w == h:
            w = rng.choices(range(nS), weights=biz, k=1)[0]
        a["work"] = w
        q = rng.choices(range(nS), weights=lei, k=1)[0]
        while q == h:
            q = rng.choices(range(nS), weights=lei, k=1)[0]
        a["play"] = q
        if kind < 0.58:
            a["kind"] = "commute"
            a["am"] = sample_time(rng, 7 * 3600 + 50 * 60, 55 * 60, 5 * 3600, 11 * 3600)
            a["pm"] = sample_time(rng, 18 * 3600 + 10 * 60, 75 * 60, 15 * 3600 + 1800, 23 * 3600 + 1800)
        elif kind < 0.84:
            a["kind"] = "daytime"
            a["am"] = sample_time(rng, 11 * 3600, 90 * 60, 8 * 3600 + 1800, 15 * 3600)
            a["pm"] = a["am"] + rng.randint(2 * 3600, 5 * 3600)
        else:
            a["kind"] = "evening"
            a["am"] = sample_time(rng, 18 * 3600 + 30 * 60, 60 * 60, 16 * 3600, 21 * 3600)
            a["pm"] = a["am"] + rng.randint(2 * 3600, 5 * 3600)
        agents.append(a)
    return agents


def trips_for_day(rng, a, weekend):
    """その日の、この人の移動(出発駅, 行き先駅, 出発時刻)の一覧。日ごとに、時刻と行くか行かないかが揺れる。"""
    jit = lambda: rng.gauss(0, 8 * 60)
    out = []
    if not weekend:
        if a["kind"] == "commute":
            if rng.random() < 0.94:
                out.append((a["home"], a["work"], int(a["am"] + jit())))
                out.append((a["work"], a["home"], int(a["pm"] + jit())))
        elif a["kind"] == "daytime":
            if rng.random() < 0.55:
                out.append((a["home"], a["play"], int(a["am"] + jit())))
                out.append((a["play"], a["home"], int(a["pm"] + jit())))
        else:
            if rng.random() < 0.40:
                out.append((a["home"], a["play"], int(a["am"] + jit())))
                out.append((a["play"], a["home"], int(a["pm"] + jit())))
    else:
        go = 0.62 if a["kind"] != "commute" else 0.5
        if rng.random() < go:
            t1 = sample_time(rng, 10 * 3600 + 30 * 60, 100 * 60, 7 * 3600, 17 * 3600)
            out.append((a["home"], a["play"], t1))
            out.append((a["play"], a["home"], min(t1 + rng.randint(2 * 3600, 7 * 3600), 23 * 3600)))
    return [(o, d, max(4 * 3600 + 30 * 60, min(t, 24 * 3600))) for o, d, t in out]


def run_day(rng, router, agents, weekend, T, boards, loads):
    nT = len(T)
    for a in agents:
        for o, d, t in trips_for_day(rng, a, weekend):
            tb = (t // BUCKET) * BUCKET
            legs = router.legs(o, d, tb, a["premium"], a["var"])
            if legs is None:
                continue
            for tr, k0, k1, fs, ts in legs:
                boards[fs] += 1
                boards[ts] += 1
                L = loads[tr]
                for k in range(k0, k1 + 1):
                    L[k] += 1


def level(ratio):
    p = ratio * 100
    for i, th in enumerate(LEVELS):
        if p <= th:
            return i + 1
    return 6


def main():
    t_start = time.time()
    master, trains, st = load()
    names, sid, T, conns = build(master, trains, st)
    nS = len(names)
    print(f"駅 {nS} / 列車 {len(T)} / つながり {len(conns)}", flush=True)
    router = Router(nS, T, conns)
    target = [st[n]["target"] for n in names]
    mh, mw = [1.0] * nS, [1.0] * nS
    scale = 1.0
    for rnd in range(IPF_ROUNDS):
        rng = random.Random(SEED)
        agents = make_agents(rng, names, st, mh, mw)
        boards = [0] * nS
        loads = [[0] * (len(t["stops"]) - 1) for t in T]
        run_day(random.Random(SEED + 1), router, agents, False, T, boards, loads)
        tot_sim = sum(boards)
        scale = sum(target) / tot_sim if tot_sim else 1
        err = 0.0
        for i in range(nS):
            sim = boards[i] * scale
            r = target[i] / sim if sim > 0 else 1.0
            err += abs(math.log(max(r, 1e-3)))
            r = min(max(r, 0.25), 4.0) ** 0.5
            mh[i] *= r
            mw[i] *= r
        print(f"  乗降客数に合わせる {rnd + 1}/{IPF_ROUNDS}: 1人=約{scale:.1f}人分 / ずれ(対数の平均) {err / nS:.3f} / 経過 {time.time() - t_start:.0f}秒", flush=True)
    # 最終: 平日5日・土休日2日を動かして、1日あたりの平均にする
    rng = random.Random(SEED)
    agents = make_agents(rng, names, st, mh, mw)
    res = {}
    for label, days, weekend in (("wd", WEEKDAYS, False), ("we", WEEKENDS, True)):
        boards = [0] * nS
        loads = [[0.0] * (len(t["stops"]) - 1) for t in T]
        for d in range(days):
            run_day(random.Random(SEED + 10 + d + (100 if weekend else 0)), router, agents, weekend, T, boards, loads)
        res[label] = (boards, loads, days)
        print(f"  {label}: {days}日分 完了 / 経過 {time.time() - t_start:.0f}秒", flush=True)
    write_outputs(master, T, names, scale, res)
    print(f"完了 {time.time() - t_start:.0f}秒")


def smooth_ratios(T, ratios):
    """同じ駅を出る、同じ方向の、近い時刻の列車どうしで、混雑をならす。
    実際の乗客は、ぴったり同じ列車にだけ乗るわけではなく、前後の列車に分かれるため。
    (自分の値 SMOOTH_SELF 割 + 前後の列車の、時間で重みをつけた平均 残り)"""
    groups = collections.defaultdict(list)   # (路線, 駅, 方向) -> [(発車秒, 列車の番号, 区間の番号)]
    for ti, t in enumerate(T):
        for k in range(len(t["stops"]) - 1):
            if t["dep"][k] is not None:
                groups[(t["seg_line"][k], t["stops"][k], t["seg_dir"][k])].append((t["dep"][k], ti, k))
    new = {}
    for items in groups.values():
        items.sort()
        n = len(items)
        for i, (dep, ti, k) in enumerate(items):
            num = den = 0.0
            for j in range(max(0, i - 8), min(n, i + 9)):
                dt = items[j][0] - dep
                w = math.exp(-0.5 * (dt / SMOOTH_SEC) ** 2)
                num += w * ratios[items[j][1]][items[j][2]]
                den += w
            new[(ti, k)] = SMOOTH_SELF * ratios[ti][k] + (1 - SMOOTH_SELF) * (num / den)
    for (ti, k), v in new.items():
        ratios[ti][k] = v


def write_outputs(master, T, names, scale, res):
    os.makedirs(OUT, exist_ok=True)
    report = []
    for label, (boards, loads, days) in res.items():
        ratios = {}
        trainfile = {}
        for ti, t in enumerate(T):
            ratios[ti] = [loads[ti][k] * scale / days / t["cap"] for k in range(len(loads[ti]))]
        smooth_ratios(T, ratios)
        for ti, t in enumerate(T):
            levels = "".join(str(level(r)) for r in ratios[ti])
            pos = 0
            for line, no, nseg in t["parts"]:
                trainfile.setdefault(line, {})[no] = levels[pos:pos + nseg]
                pos += nseg
        json.dump(trainfile, open(os.path.join(OUT, f"train_{label}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        # 報告: レベルの分布と、いちばん混む区間
        cnt = collections.Counter()
        worst = []
        for ti, t in enumerate(T):
            for k, r in enumerate(ratios[ti]):
                cnt[level(r)] += 1
                worst.append((r, t["seg_line"][k], t["no"], t["type"], names[t["stops"][k]], names[t["stops"][k + 1]], hhmm(t["dep"][k])))
        worst.sort(reverse=True)
        report.append(f"[{label}] 区間ごとのレベル分布: " + ", ".join(f"L{k}={cnt[k]}" for k in range(1, 7)))
        for r, line, no, ty, a, b, h in worst[:8]:
            report.append(f"  最混雑 {r * 100:.0f}%  {line} {no} {ty}  {h} {a}→{b}")
    print("\n".join(report))
    open(os.path.join(HERE, "report.txt"), "w", encoding="utf-8").write("\n".join(report) + "\n")


if __name__ == "__main__":
    main()
