# 混雑予報(仮)のシミュレーター。仮想の住民を、実際のダイヤ(public/data/dia-2)の上で動かして、
# 駅 × 時間帯 と 列車ごと の混雑レベル(1〜6)を、public/data/crowd-2/ に書き出す。
# 設計は docs/NIZAKI-2.0-crowd.md。計算はこの Mac で1回だけ(アプリは、できた JSON を読むだけ)。
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
BUCKET = 300                # 出発時刻のまとめ(秒)。同じ駅・同じ5分は、同じ探索結果を使う
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
    """全列車を「つながり(connection)」にする。駅は、駅名で1つにまとめる(乗換駅は、路線をまたぐ)。"""
    names = sorted(st)
    sid = {n: i for i, n in enumerate(names)}
    T = []   # 列車: dict(line, no, type, paid, cap, stops=[駅番号...], arr=[...], dep=[...])
    conns = []
    for c, tl in trains.items():
        m = master[c]
        for t in tl:
            no, ty, d, run, t0, a = t
            nm, ab, paid = m["types"][ty][0], m["types"][ty][1], m["types"][ty][2]
            cars = 10 if ("特急" in nm or nm == "特別快速") else 8
            cap = cars * (PAID_CAR_CAP if paid else CAR_CAP)
            stops, arr, dep = [], [], []
            for k in range(0, len(a), 3):
                stops.append(sid[m["stations"][a[k]][0]])
                arr.append(t0 + a[k + 1] if a[k + 1] >= 0 else None)
                dep.append(t0 + a[k + 2] if a[k + 2] >= 0 else None)
            ti = len(T)
            T.append(dict(line=c, no=no, type=nm, paid=bool(paid), cap=cap, stops=stops, arr=arr, dep=dep))
            for k in range(len(stops) - 1):
                conns.append((dep[k], arr[k + 1], stops[k], stops[k + 1], ti, k))
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

    def scan(self, origin, t0, premium):
        key = (origin, t0, premium)
        r = self.cache.get(key)
        if r is not None:
            return r
        INF = 10 ** 9
        earliest = [INF] * self.nS
        earliest[origin] = t0
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
                    if arr[i] < earliest[d]:
                        earliest[d] = arr[i]
                        parent[d] = (i, b)
            i += 1
        self.cache[key] = r = (earliest, parent)
        return r

    def legs(self, origin, dest, t0, premium):
        earliest, parent = self.scan(origin, t0, premium)
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
        a = dict(home=h, premium=rng.random() < PREMIUM_RATE)
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
            legs = router.legs(o, d, tb, a["premium"])
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


def write_outputs(master, T, names, scale, res):
    os.makedirs(OUT, exist_ok=True)
    report = []
    for label, (boards, loads, days) in res.items():
        ratios = {}
        trainfile = {}
        for ti, t in enumerate(T):
            rs = [loads[ti][k] * scale / days / t["cap"] for k in range(len(loads[ti]))]
            ratios[ti] = rs
            trainfile.setdefault(t["line"], {})[t["no"]] = "".join(str(level(r)) for r in rs)
        json.dump(trainfile, open(os.path.join(OUT, f"train_{label}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        # 駅 × 30分枠(5:00〜翌1:00)。その駅を出る列車の、乗車率の平均
        SLOTS = 40
        acc = {}
        for ti, t in enumerate(T):
            m = master[t["line"]]
            dirs = m["dirs"]
            for k in range(len(t["stops"]) - 1):
                if t["dep"][k] is None:
                    continue
                slot = (t["dep"][k] - 5 * 3600) // 1800
                if not (0 <= slot < SLOTS):
                    continue
                acc.setdefault((t["line"], t["stops"][k], T[ti]["no"][len(t["line"]):len(t["line"]) + 1], slot), []).append(ratios[ti][k])
        slotfile = {}
        for (line, s, dch, slot), rs in acc.items():
            slotfile.setdefault(line, {}).setdefault(dch, {}).setdefault(names[s], ["0"] * SLOTS)[slot] = str(level(sum(rs) / len(rs)))
        for line in slotfile:
            for dch in slotfile[line]:
                for n in slotfile[line][dch]:
                    slotfile[line][dch][n] = "".join(slotfile[line][dch][n])
        json.dump(slotfile, open(os.path.join(OUT, f"slot_{label}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        # 報告: レベルの分布と、いちばん混む区間
        cnt = collections.Counter()
        worst = []
        for ti, t in enumerate(T):
            for k, r in enumerate(ratios[ti]):
                cnt[level(r)] += 1
                worst.append((r, t["line"], t["no"], t["type"], names[t["stops"][k]], names[t["stops"][k + 1]], hhmm(t["dep"][k])))
        worst.sort(reverse=True)
        report.append(f"[{label}] 区間ごとのレベル分布: " + ", ".join(f"L{k}={cnt[k]}" for k in range(1, 7)))
        for r, line, no, ty, a, b, h in worst[:8]:
            report.append(f"  最混雑 {r * 100:.0f}%  {line} {no} {ty}  {h} {a}→{b}")
    print("\n".join(report))
    open(os.path.join(HERE, "report.txt"), "w", encoding="utf-8").write("\n".join(report) + "\n")


if __name__ == "__main__":
    main()
