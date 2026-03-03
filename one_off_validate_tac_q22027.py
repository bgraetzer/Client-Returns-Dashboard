import argparse
import json
import math


def annualize(returns):
    product = 1.0
    for r in returns:
        if r is not None and not math.isnan(r):
            product *= (1 + r / 100)
    years = len(returns) / 12
    return (math.pow(product, 1 / years) - 1) * 100


def multiply_returns(returns):
    product = 1.0
    for r in returns:
        if r is not None and not math.isnan(r):
            product *= (1 + r / 100)
    return product


def annual_to_quarterly_compounded(annual_percent):
    return (math.pow(1 + annual_percent / 100, 1 / 4) - 1) * 100


def annual_to_monthly_compounded(annual_percent):
    return (math.pow(1 + annual_percent / 100, 1 / 12) - 1) * 100


def quarterly_to_monthly_compounded(quarterly_percent):
    return (math.pow(1 + quarterly_percent / 100, 1 / 3) - 1) * 100


def get_benchmark_quarterly_return(quarterly_inflation_percent, objective_annual_percent):
    objective_monthly = annual_to_monthly_compounded(objective_annual_percent)
    inflation_monthly = quarterly_to_monthly_compounded(quarterly_inflation_percent)
    benchmark_monthly = objective_monthly + inflation_monthly
    return benchmark_monthly


def main():
    parser = argparse.ArgumentParser(description="One-off TAC required return validator for Q2 2027")
    parser.add_argument("--objective", type=float, default=4.0, help="TAC objective annual % (default 4.0)")
    parser.add_argument("--q1to8", type=float, default=1.0, help="Quarterly inflation spread for Q1-Q8 % (default 1.0)")
    parser.add_argument(
        "--inflation-quarters",
        type=str,
        default=None,
        help="Comma-separated quarterly inflation spreads for Q1-Q8 (e.g. 1.2,1.1,1.0,0.9,0.9,0.8,0.8,0.8)"
    )
    parser.add_argument("--long-term", dest="long_term", type=float, default=4.0, help="Long-term annual inflation spread % (default 4.0)")
    parser.add_argument("--months", type=int, default=18, help="Months forward to quarter (Q2 2027 from Dec-2025 is 18)")
    parser.add_argument("--rolling-months", dest="rolling_months", type=int, default=96, help="Rolling window months (8 years = 96)")
    parser.add_argument("--claimed-annual", dest="claimed_annual", type=float, default=8.70, help="Claimed required annualised return to validate")
    args = parser.parse_args()

    with open("client_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    actual = data["clients"]["TAC"]["actual"]
    benchmark_hist = data["clients"]["TAC"]["benchmark"]

    if args.inflation_quarters:
        try:
            inflation_quarters = [float(x.strip()) for x in args.inflation_quarters.split(",")]
        except ValueError as e:
            raise SystemExit(f"Invalid --inflation-quarters values: {e}")
        if len(inflation_quarters) != 8:
            raise SystemExit("--inflation-quarters must contain exactly 8 values for Q1-Q8")
    else:
        inflation_quarters = [args.q1to8] * 8

    months_from_now = args.months
    rolling_months = args.rolling_months

    benchmark_combined = benchmark_hist.copy()
    months_added = 0
    while months_added < months_from_now:
        current_quarter = months_added // 3
        if current_quarter < 8:
            quarterly_inflation = inflation_quarters[current_quarter]
        else:
            quarterly_inflation = annual_to_quarterly_compounded(args.long_term)

        benchmark_monthly = get_benchmark_quarterly_return(quarterly_inflation, args.objective)

        for _ in range(3):
            if months_added >= months_from_now:
                break
            benchmark_combined.append(benchmark_monthly)
            months_added += 1

    benchmark_window = benchmark_combined[-rolling_months:]
    benchmark_window_product = multiply_returns(benchmark_window)

    historical_in_window = max(0, rolling_months - months_from_now)
    actual_historical_window = actual[-historical_in_window:] if historical_in_window > 0 else []
    historical_actual_product = multiply_returns(actual_historical_window)

    required_future_product = benchmark_window_product / historical_actual_product
    required_monthly = (math.pow(required_future_product, 1 / months_from_now) - 1) * 100
    required_annual = (math.pow(1 + required_monthly / 100, 12) - 1) * 100

    actual_window_with_required = actual_historical_window + [required_monthly] * months_from_now
    achieved_actual_annual = annualize(actual_window_with_required)
    target_benchmark_annual = annualize(benchmark_window)
    annual_match_diff_bps = (achieved_actual_annual - target_benchmark_annual) * 100

    claimed_monthly = (math.pow(1 + args.claimed_annual / 100, 1 / 12) - 1) * 100
    actual_window_with_claimed = actual_historical_window + [claimed_monthly] * months_from_now
    achieved_with_claimed_annual = annualize(actual_window_with_claimed)
    claimed_gap_bps = (achieved_with_claimed_annual - target_benchmark_annual) * 100

    print("=" * 80)
    print("TAC REQUIRED RETURN VALIDATION - Q2 2027")
    print("=" * 80)
    print(
        f"Assumptions: objective={args.objective:.2f}% p.a., "
        f"Q1-Q8 inflation spreads={','.join(f'{x:.2f}' for x in inflation_quarters)}% qtr, "
        f"long-term={args.long_term:.2f}% p.a."
    )
    print(f"Window: months_forward={months_from_now}, rolling_months={rolling_months}")
    print("-")
    print(f"Computed required monthly return:   {required_monthly:.6f}%")
    print(f"Computed required annual return:    {required_annual:.6f}%")
    print(f"Target benchmark rolling annual:    {target_benchmark_annual:.6f}%")
    print(f"Achieved actual annual (plug-back): {achieved_actual_annual:.6f}%")
    print(f"Plug-back match diff:               {annual_match_diff_bps:.6f} bps")
    print("-")
    print(f"Claimed annual to test:             {args.claimed_annual:.6f}%")
    print(f"Annual achieved using claimed:      {achieved_with_claimed_annual:.6f}%")
    print(f"Claimed-vs-target gap:              {claimed_gap_bps:.6f} bps")
    print("=" * 80)


if __name__ == "__main__":
    main()
