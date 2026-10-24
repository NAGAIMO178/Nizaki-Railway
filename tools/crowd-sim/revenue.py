# 1日の収入の概算。混雑のシミュレーター(sim.py)と同じ仮想の住民を、同じダイヤの上で動かして、
# 乗った区間の営業キロ → 運賃、有料特急の特急料金、を足し上げる。運営費と比べるための、超ざっくりした概算。
# 混雑のデータ(public/data/crowd-2)は書き換えない。出力は tools/crowd-sim/revenue.txt と revenue.json だけ。
#   使い方:  python3 tools/crowd-sim/revenue.py        (標準ライブラリだけ。3〜4分)
#   DEMAND=1.0 python3 tools/crowd-sim/revenue.py       (乗降客数の倍率を変えて、1通りだけ動かす)
# 運賃の表は JSON(fare-current.json = 今の表)。FARES=fare-current.json,別の表.json で、比べる表を選べる(絶対パスでもよい。表を足せば、再計算できる)。
# 住民の動きは DEMAND によらず同じ(乗降客数に合わせる倍率が、DEMAND に比例するだけ)なので、1回の実行で、DEMANDS=2.0,1.0 の2通りを出す。
import collections, json, os, random, re, sys, time

import sim

HERE = sim.HERE
OUT_DIR = os.environ.get("REVENUE_OUT_DIR", HERE)   # 出力先(試し実行で、revenue.txt を上書きしないとき)
OUT_TXT = os.path.join(OUT_DIR, "revenue.txt")
OUT_JSON = os.path.join(OUT_DIR, "revenue.json")

FARES = [f.strip() for f in os.environ.get("FARES", "fare-current.json").split(",") if f.strip()]
DEMANDS = [float(x) for x in os.environ.get("DEMANDS", "2.0,1.0").split(",")]

# ---------------- 仮定(結果を見て調整する数字) ----------------
# 特急料金(src/components/ReservationTab.tsx の baseExpressFee と同じ表)と、座席の種類の比率
EXPRESS_FEES = {
    "特急あやみ": [("自由席", 750, 0.20), ("指定席", 1150, 0.65), ("あやみ+", 2200, 0.15)],
    "特急めぐり": [("指定席", 1250, 0.80), ("めぐシート", 2050, 0.20)],
    "特急(Nライナー)": [("指定席", 1250, 1.00)],
}


def express_fee(type_name):
    """座席の比率で重みをつけた、特急料金の期待値(1回乗るごと)。"""
    rows = EXPRESS_FEES.get(type_name)
    if rows is None:
        print(f"警告: 特急料金の表に無い有料の種別: {type_name}(1,250円で計算)", file=sys.stderr)
        return 1250.0
    return sum(fee * ratio for _, fee, ratio in rows)


# ---------------- 運賃の表 ----------------
def load_fare(name):
    d = json.load(open(os.path.join(HERE, name), encoding="utf-8"))
    return dict(name=d["name"], file=name, tiers=[(float(u), int(f)) for u, f in d["tiers"]], over=int(d["over"]))


def fare_of(table, km):
    if km <= 0:
        return 0
    for upper, f in table["tiers"]:
        if km <= upper:
            return f
    return table["over"]


def tier_labels(table):
    """営業キロの区分の名前(src/utils/fare.ts の fareTierLabel と同じ書き方)。"""
    labels, prev = [], None
    for upper, _ in table["tiers"]:
        u = f"{upper:g}"
        labels.append((upper, f"{u}km以下" if prev is None else f"{prev:g}.1〜{u}km"))
        prev = upper
    labels.append((float("inf"), f"{prev:g}.1km以上"))
    return labels


def tier_of(table, km):
    for upper, label in tier_labels(table):
        if km <= upper:
            return label
    return ""


def check_against_fare_ts(table):
    """fare-current.json が、アプリの運賃表(src/utils/fare.ts)と同じかを確かめる(ちがえば、警告)。"""
    src = open(os.path.join(sim.ROOT, "src", "utils", "fare.ts"), encoding="utf-8").read()
    body = src.split("calculateFare", 1)[1].split("};", 1)[0]
    tiers = [(float(a), int(b)) for a, b in re.findall(r"dist <= (\d+(?:\.\d+)?)\) return (\d+);", body) if float(a) > 0]
    last = re.findall(r"return (\d+);", body)[-1]
    if tiers != table["tiers"] or int(last) != table["over"]:
        print(f"警告: {table['file']} が src/utils/fare.ts の運賃表と違う", file=sys.stderr)


# ---------------- 営業キロ ----------------
class Km:
    """区間ごとの営業キロ。環状線は、列車の進む向きに進む分(アプリの tripDistance と同じ)。"""

    def __init__(self, master, names):
        self.master = master
        self.idx = {c: {s[0]: i for i, s in enumerate(m["stations"])} for c, m in master.items()}
        self.names = names

    def seg(self, line, a, b, d):
        m = self.master[line]
        km = [s[1] for s in m["stations"]]
        ia, ib = self.idx[line][self.names[a]], self.idx[line][self.names[b]]
        if not m["loop"]:
            return abs(km[ib] - km[ia])
        n = len(km)
        end = m.get("loopKm") or km[n - 1] + (km[n - 1] - km[n - 2])
        if d == m["dirs"][0]:
            return km[ib] - km[ia] if ib > ia else end - km[ia] + km[ib]
        return km[ia] - km[ib] if ib < ia else km[ia] + (end - km[ib])


def main():
    t0 = time.time()
    master, trains, st = sim.load()
    names, sid, T, conns = sim.build(master, trains, st)
    nS = len(names)
    router = sim.Router(nS, T, conns)
    kmcalc = Km(master, names)
    tables = [load_fare(f) for f in FARES]
    for t in tables:
        if t["file"] == "fare-current.json":
            check_against_fare_ts(t)

    # 列車ごとの、距離と車両数(車両キロ)
    train_km = []
    for tr in T:
        d = 0.0
        for k in range(len(tr["stops"]) - 1):
            d += kmcalc.seg(tr["seg_line"][k], tr["stops"][k], tr["stops"][k + 1], tr["seg_dir"][k])
        cars = tr["cap"] / (sim.PAID_CAR_CAP if tr["paid"] else sim.CAR_CAP)
        train_km.append((d, cars))
    car_km = sum(d * c for d, c in train_km)

    # 乗降客数に合わせる(sim.py の main と同じ)
    target = [st[n]["target"] for n in names]
    mh, mw = [1.0] * nS, [1.0] * nS
    scale = 1.0
    for rnd in range(sim.IPF_ROUNDS):
        rng = random.Random(sim.SEED)
        agents = sim.make_agents(rng, names, st, mh, mw)
        boards = [0] * nS
        loads = [[0] * (len(t["stops"]) - 1) for t in T]
        sim.run_day(random.Random(sim.SEED + 1), router, agents, False, T, boards, loads)
        tot_sim = sum(boards)
        scale = sum(target) / tot_sim if tot_sim else 1
        for i in range(nS):
            s = boards[i] * scale
            r = target[i] / s if s > 0 else 1.0
            r = min(max(r, 0.25), 4.0) ** 0.5
            mh[i] *= r
            mw[i] *= r
        print(f"  乗降客数に合わせる {rnd + 1}/{sim.IPF_ROUNDS} / 経過 {time.time() - t0:.0f}秒", flush=True)

    # 最終: 平日5日・土休日2日を動かして、乗った区間を集める
    rng = random.Random(sim.SEED)
    agents = sim.make_agents(rng, names, st, mh, mw)
    trips = {}   # 日の種類 -> {(最初に乗った路線, 営業キロ(0.1km), 有料の列車の種別の並び): 回数}
    for label, days, weekend in (("wd", sim.WEEKDAYS, False), ("we", sim.WEEKENDS, True)):
        cnt = collections.Counter()
        for dd in range(days):
            r2 = random.Random(sim.SEED + 10 + dd + (100 if weekend else 0))
            for a in agents:
                for o, d, t in sim.trips_for_day(r2, a, weekend):
                    legs = router.legs(o, d, (t // sim.BUCKET) * sim.BUCKET, a["premium"], a["var"])
                    if legs is None:
                        continue
                    km, paid = 0.0, []
                    for tr, k0, k1, fs, ts in legs:
                        x = T[tr]
                        for k in range(k0, k1 + 1):
                            km += kmcalc.seg(x["seg_line"][k], x["stops"][k], x["stops"][k + 1], x["seg_dir"][k])
                        if x["paid"]:
                            paid.append(x["type"])
                    first = legs[-1]   # legs は、降りる側から数えた順
                    line = T[first[0]]["seg_line"][first[1]]
                    cnt[(line, round(km * 10) / 10, tuple(sorted(paid)))] += 1
        trips[label] = (cnt, days)
        print(f"  {label}: {days}日分 完了 / 経過 {time.time() - t0:.0f}秒", flush=True)

    # 集計
    base_demand = sim.DEMAND
    result = dict(
        assumptions=dict(
            express_fees={k: [dict(seat=s, fee=f, ratio=r) for s, f, r in v] for k, v in EXPRESS_FEES.items()},
            base_demand=base_demand, agents=sim.N_AGENTS, weight_per_agent=scale,
            car_km_per_day=car_km, cars="8両(特急・特別快速は10両)",
        ),
        runs=[],
    )
    for dem in DEMANDS:
        f = dem / base_demand   # 住民の動きは DEMAND によらず同じ。人数の重みが DEMAND に比例する
        for table in tables:
            run = dict(demand=dem, fare_table=table["name"], fare_file=table["file"], days={})
            for label, (cnt, days) in trips.items():
                w = scale * f / days
                riders = fare_rev = exp_rev = 0.0
                by_line = collections.defaultdict(lambda: dict(riders=0.0, revenue=0.0))
                by_tier = collections.OrderedDict((lab, dict(riders=0.0, revenue=0.0)) for _, lab in tier_labels(table))
                for (line, km, paid), n in cnt.items():
                    fare = fare_of(table, km)
                    fee = sum(express_fee(p) for p in paid)
                    riders += n * w
                    fare_rev += n * w * fare
                    exp_rev += n * w * fee
                    by_line[line]["riders"] += n * w
                    by_line[line]["revenue"] += n * w * (fare + fee)
                    by_tier[tier_of(table, km)]["riders"] += n * w
                    by_tier[tier_of(table, km)]["revenue"] += n * w * (fare + fee)
                total = fare_rev + exp_rev
                run["days"][label] = dict(
                    riders=riders, fare_revenue=fare_rev, express_revenue=exp_rev, total_revenue=total,
                    avg_fare=fare_rev / riders if riders else 0, avg_total=total / riders if riders else 0,
                    revenue_per_car_km=total / car_km if car_km else 0,
                    by_line={k: v for k, v in sorted(by_line.items())}, by_tier=by_tier,
                )
            result["runs"].append(run)
    json.dump(result, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_text(result, master)
    print(f"完了 {time.time() - t0:.0f}秒")


def write_text(result, master):
    A = result["assumptions"]
    lines = [
        "# 1日の収入の概算(tools/crowd-sim/revenue.py。仮想の住民6万人 × 実際のダイヤ)",
        f"# 住民1人 = 約{A['weight_per_agent']:.1f}人分(DEMAND={A['base_demand']:g} のとき)。車両キロ(1日) = {A['car_km_per_day']:,.0f}車両km({A['cars']})",
        "# 特急料金は、座席の比率で重みをつけた期待値: " + " / ".join(
            f"{k}: " + "・".join(f"{r['seat']}{r['fee']}円×{r['ratio']:.0%}" for r in v) for k, v in A["express_fees"].items()),
        "# 路線別は、最初に乗った路線。運賃は、乗り換えや直通をまたいだ、通しの営業キロで出す。",
        "",
    ]
    line_names = {c: m["name"] for c, m in master.items()}
    for run in result["runs"]:
        lines.append(f"==== DEMAND={run['demand']:g} / 運賃表: {run['fare_table']} ({run['fare_file']}) ====")
        for label, jp in (("wd", "平日"), ("we", "土休日")):
            d = run["days"][label]
            lines.append(
                f"[{jp}] 利用者 {d['riders']:,.0f}人 / 運賃 {d['fare_revenue']:,.0f}円 + 特急料金 {d['express_revenue']:,.0f}円 = 合計 {d['total_revenue']:,.0f}円 "
                f"/ 平均運賃 {d['avg_fare']:.0f}円(特急込み {d['avg_total']:.0f}円) / 1車両kmあたり {d['revenue_per_car_km']:.1f}円")
            lines.append("  路線別: " + " / ".join(f"{line_names[k]} {v['riders']:,.0f}人 {v['revenue']:,.0f}円" for k, v in d["by_line"].items()))
            lines.append("  区分別: " + " / ".join(f"{k} {v['riders']:,.0f}人 {v['revenue']:,.0f}円" for k, v in d["by_tier"].items()))
        lines.append("")
    open(OUT_TXT, "w", encoding="utf-8").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
