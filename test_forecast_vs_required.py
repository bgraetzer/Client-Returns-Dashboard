"""
Test: Forecast Rolling Returns vs Required Returns — Diagnostic

This test replicates the dashboard's JavaScript logic in Python to:
1. Generate forecast rolling returns (actual, benchmark, relative) at the second forecast quarter
2. Calculate the required returns shown in the Required Returns Table at the second forecast quarter
3. Compare the two to determine if there is a logic bug

USER-REPORTED ISSUE:
    - Forecast chart shows ALL clients FUM-weighted at the second forecast quarter:
      Actual = 7.97% p.a., Benchmark = 7.89% p.a., Relative = 0.08% (ahead)
  - Required Returns table shows weighted required return = 4.46% cumulative
  - User's return assumptions are LOWER than 4.46%, yet the forecast says
    the portfolio is AHEAD of objective. This seems contradictory.

HYPOTHESIS:
  The "required return" table uses forecastData.benchmark (the FORECASTED
  rolling benchmark return, e.g. ~7.89% p.a.) as the TARGET the portfolio
  must achieve. It then asks: "what cumulative return over 6 months is needed
  to make the ACTUAL rolling return = the BENCHMARK rolling return?"

  But the ACTUAL rolling return already EXCEEDS the BENCHMARK (7.97 > 7.89),
  so the required return should be LESS than what the user is currently
  assuming, not MORE. The 4.46% figure seems to be the return needed to
  match the benchmark, which should indeed be achievable if the user is
  already ahead.

  The user might be comparing 4.46% cumulative (6 months) against their
  quarterly return assumption (e.g. 2% per quarter = ~4% over 6 months).
  But the required 4.46% cumulative over 6 months is equivalent to ~8.9% p.a.,
  which is indeed close to the benchmark target.

  Let's verify with real numbers.
"""

import json
import math
import sys
from datetime import datetime


def parse_dashboard_date(value):
    return datetime.strptime(value.split()[0], '%Y-%m-%d')


def quarter_end_for(date_value):
    quarter_month = ((date_value.month - 1) // 3) * 3 + 3
    if quarter_month == 3:
        day = 31
    elif quarter_month == 6:
        day = 30
    elif quarter_month == 9:
        day = 30
    else:
        day = 31
    return datetime(date_value.year, quarter_month, day)


def add_quarter(date_value):
    if date_value.month == 3:
        return datetime(date_value.year, 6, 30)
    if date_value.month == 6:
        return datetime(date_value.year, 9, 30)
    if date_value.month == 9:
        return datetime(date_value.year, 12, 31)
    return datetime(date_value.year + 1, 3, 31)


def months_between(start, end):
    return (end.year - start.year) * 12 + (end.month - start.month)


def annualize_return(returns, periods):
    """Replicate FinancialCalculator.annualizeReturn"""
    if not returns or len(returns) == 0 or periods == 0:
        return None
    if len(returns) != periods:
        return None
    valid = [r for r in returns if r is not None and not math.isnan(r)]
    if len(valid) != periods:
        return None
    compounded = 1.0
    for r in valid:
        compounded *= (1 + r / 100)
    years = periods / 12
    if years <= 0:
        return None
    return (compounded ** (1 / years) - 1) * 100


def load_client_data():
    with open('client_data.json', 'r') as f:
        return json.load(f)


def load_fum_data():
    with open('FUM_Data_2026-03-31.json', 'r') as f:
        data = json.load(f)
    return data['2026-03-31']


def run_test():
    print("=" * 80)
    print("DIAGNOSTIC TEST: Forecast Rolling Returns vs Required Returns")
    print("=" * 80)

    # Load data
    client_data = load_client_data()
    fum_config = load_fum_data()
    
    clients = client_data['clients']
    dates = client_data['dates']
    fum_values = fum_config['values']
    objectives = fum_config['objectives']
    rolling_config = fum_config['rolling']
    
    VIF_INCEPTION_INDEX = 440

    print(f"\nData ends at: {dates[-1]}")
    print(f"Number of monthly data points per client: {len(dates)}")
    print(f"Last date index: {len(dates) - 1}")
    
    # -------------------------------------------------------------------
    # USER ASSUMPTIONS (as described by user for the next 2 quarters)
    # CPI quarterly = 1.0% (default)
    # Actual quarterly return = 2.0% (default)
    # These are the dashboard defaults. Adjust if your screenshot differs.
    # -------------------------------------------------------------------
    # NOTE: The user said "assumptions for next 2 quarterly returns"
    # The dashboard uses Q1-Q8 quarterly inputs. For Q1 and Q2 these are
    # the first two quarters from the data end date (Dec 2025).
    # Default CPI = 1.0% per quarter, Actual = 2.0% per quarter
    
    # We'll test with a range of assumptions to see the effect
    test_scenarios = [
        {"name": "Default (2.0% actual, 1.0% CPI)", "actual_q": 2.0, "cpi_q": 1.0},
        {"name": "Low (1.5% actual, 0.8% CPI)", "actual_q": 1.5, "cpi_q": 0.8},
        {"name": "Very low (1.0% actual, 0.8% CPI)", "actual_q": 1.0, "cpi_q": 0.8},
    ]
    
    for scenario in test_scenarios:
        print(f"\n{'='*80}")
        print(f"SCENARIO: {scenario['name']}")
        print(f"{'='*80}")
        
        actual_quarterly = scenario['actual_q']  # % per quarter
        cpi_quarterly = scenario['cpi_q']        # % per quarter
        objective_annual = 4.0                    # % p.a. (CPI + 4%)
        
        # Dashboard logic: benchmarkAnnualTarget = objective + (quarterlyInflation * 4)
        benchmark_annual_target = objective_annual + (cpi_quarterly * 4)
        # Dashboard logic: actualAnnualTarget = quarterlyActual * 4
        actual_annual_target = actual_quarterly * 4
        
        # Convert to monthly compounded returns
        benchmark_monthly = (math.pow(1 + benchmark_annual_target / 100, 1/12) - 1) * 100
        actual_monthly = (math.pow(1 + actual_annual_target / 100, 1/12) - 1) * 100
        
        print(f"\n  Benchmark annual target: {benchmark_annual_target:.2f}% p.a. (obj {objective_annual}% + CPI {cpi_quarterly}%*4)")
        print(f"  Actual annual target: {actual_annual_target:.2f}% p.a. ({actual_quarterly}%*4)")
        print(f"  Benchmark monthly: {benchmark_monthly:.4f}%")
        print(f"  Actual monthly: {actual_monthly:.4f}%")
        
        last_data_date = parse_dashboard_date(dates[-1])
        last_quarter_end = quarter_end_for(last_data_date)
        q1_end = add_quarter(last_quarter_end) if last_data_date == last_quarter_end else last_quarter_end
        q2_end = add_quarter(q1_end)
        q1_label = f"Q{((q1_end.month - 1) // 3) + 1} {q1_end.year}"
        q2_label = f"Q{((q2_end.month - 1) // 3) + 1} {q2_end.year}"
        months_q1 = months_between(last_data_date, q1_end)
        months_q2 = months_between(last_data_date, q2_end)
        
        print(f"\n  --- FORECAST ROLLING RETURNS at {q2_label} ({months_q2} months forward) ---")
        
        # For each client, replicate generateQuarterlyForecast at the second forecast quarter
        forecast_results = {}
        for client_name, client in clients.items():
            rolling_years = rolling_config.get(client_name, 8)
            actual = list(client['actual'])
            benchmark = list(client['benchmark'])
            
            # Add forecast months through the second forecast quarter
            actual_combined = actual[:]
            benchmark_combined = benchmark[:]
            for m in range(months_q2):
                actual_combined.append(actual_monthly)
                benchmark_combined.append(benchmark_monthly)
            
            if client_name == 'VIF' or rolling_years == 'inception':
                actual_since = actual_combined[VIF_INCEPTION_INDEX:]
                benchmark_since = benchmark_combined[VIF_INCEPTION_INDEX:]
                months_since = len(actual_since)
                actual_rolling = annualize_return(actual_since, months_since)
                benchmark_rolling = annualize_return(benchmark_since, months_since)
            else:
                rolling_months = int(rolling_years) * 12
                if len(actual_combined) >= rolling_months:
                    window_actual = actual_combined[-rolling_months:]
                    window_benchmark = benchmark_combined[-rolling_months:]
                    actual_rolling = annualize_return(window_actual, rolling_months)
                    benchmark_rolling = annualize_return(window_benchmark, rolling_months)
                else:
                    actual_rolling = None
                    benchmark_rolling = None
            
            relative = None
            if actual_rolling is not None and benchmark_rolling is not None:
                relative = actual_rolling - benchmark_rolling
            
            forecast_results[client_name] = {
                'actual': actual_rolling,
                'benchmark': benchmark_rolling,
                'relative': relative
            }
        
        # FUM-weighted forecast
        total_weight = 0
        weighted_actual = 0
        weighted_benchmark = 0
        
        for client_name in clients:
            fum = fum_values.get(client_name, 0)
            fr = forecast_results[client_name]
            if fum > 0 and fr['actual'] is not None and fr['benchmark'] is not None:
                weighted_actual += fr['actual'] * fum
                weighted_benchmark += fr['benchmark'] * fum
                total_weight += fum
        
        if total_weight > 0:
            wa = weighted_actual / total_weight
            wb = weighted_benchmark / total_weight
            wr = wa - wb
        else:
            wa = wb = wr = None
        
        print(f"\n  Per-client forecast at {q2_label}:")
        for cn in ['ESSDB', 'ESSSF', 'TAC', 'VMIA', 'VWA', 'VIF']:
            fr = forecast_results[cn]
            fum = fum_values.get(cn, 0)
            print(f"    {cn:6s}: Actual={fr['actual']:7.2f}% Benchmark={fr['benchmark']:7.2f}%"
                  f" Relative={fr['relative']:+6.2f}%  FUM=${fum:,.0f}M")
        
        print(f"\n  FUM-Weighted ALL Clients at {q2_label}:")
        print(f"    Actual:    {wa:.2f}% p.a.")
        print(f"    Benchmark: {wb:.2f}% p.a.")
        print(f"    Relative:  {wr:+.2f}%")
        
        # -------------------------------------------------------------------
        # REQUIRED RETURNS TABLE at the second forecast quarter
        # -------------------------------------------------------------------
        print(f"\n  --- REQUIRED RETURNS TABLE at {q2_label} ---")
        print(f"  (What cumulative return is needed over next {months_q2} months to make")
        print(f"   actual rolling return = benchmark rolling return?)")
        
        total_weight_rr = 0
        weighted_rr = 0
        
        for client_name, client in clients.items():
            rolling_years = rolling_config.get(client_name, 8)
            fum = fum_values.get(client_name, 0)
            
            if fum <= 0:
                continue
            
            fr = forecast_results[client_name]
            if fr['benchmark'] is None:
                continue
            
            # TARGET: the forecasted benchmark rolling return at the second forecast quarter
            target_annual = fr['benchmark']
            
            months_from_now = months_q2
            
            if client_name == 'VIF' or rolling_years == 'inception':
                historical_months = len(client['actual']) - VIF_INCEPTION_INDEX
                total_months = historical_months + months_from_now
                historical_in_window = historical_months
                future_in_window = months_from_now
                
                historical_product = 1.0
                for i in range(VIF_INCEPTION_INDEX, len(client['actual'])):
                    val = client['actual'][i]
                    if val is not None:
                        historical_product *= (1 + val / 100)
            else:
                rolling_months = int(rolling_years) * 12
                total_months = rolling_months
                
                if months_from_now >= rolling_months:
                    historical_in_window = 0
                    future_in_window = rolling_months
                else:
                    historical_needed = rolling_months - months_from_now
                    historical_in_window = min(historical_needed, len(client['actual']))
                    future_in_window = rolling_months - historical_in_window
                
                historical_product = 1.0
                if historical_in_window > 0:
                    start_idx = len(client['actual']) - historical_in_window
                    for i in range(start_idx, len(client['actual'])):
                        val = client['actual'][i]
                        if val is not None and i >= 0:
                            historical_product *= (1 + val / 100)
            
            # Target compounded return over the total rolling window
            target_compounded = math.pow(1 + target_annual / 100, total_months / 12)
            
            # Required future product
            if future_in_window > 0:
                required_future_product = target_compounded / historical_product
                required_monthly_multiplier = math.pow(required_future_product, 1 / future_in_window)
                required_monthly = (required_monthly_multiplier - 1) * 100
            else:
                required_monthly = 0
            
            # Display value: cumulative for ≤ 12 months
            if months_from_now <= 12:
                display_value = (math.pow(1 + required_monthly / 100, months_from_now) - 1) * 100
            else:
                display_value = (math.pow(1 + required_monthly / 100, 12) - 1) * 100
            
            # Also compute what the assumed actual cumulative return is over 6 months
            assumed_cumulative = (math.pow(1 + actual_monthly / 100, months_from_now) - 1) * 100
            
            print(f"\n    {client_name}:")
            print(f"      Target (forecasted bmk rolling): {target_annual:.4f}% p.a.")
            print(f"      Total rolling window: {total_months} months")
            print(f"      Historical in window: {historical_in_window} months, product: {historical_product:.6f}")
            print(f"      Future months needed: {future_in_window}")
            print(f"      Target compounded (over {total_months} months): {target_compounded:.6f}")
            print(f"      Required future product: {target_compounded / historical_product:.6f}")
            print(f"      Required monthly return: {required_monthly:.4f}%")
            print(f"      Required cumulative (6m): {display_value:.2f}%")
            print(f"      Assumed actual cumulative (6m): {assumed_cumulative:.2f}%")
            print(f"      Surplus/Deficit: {assumed_cumulative - display_value:+.2f}%")
            
            weighted_rr += display_value * fum
            total_weight_rr += fum
        
        if total_weight_rr > 0:
            avg_rr = weighted_rr / total_weight_rr
        else:
            avg_rr = None
        
        assumed_cum_6m = (math.pow(1 + actual_monthly / 100, months_q2) - 1) * 100
        
        print(f"\n  FUM-Weighted Required Return (cumulative, 6m): {avg_rr:.2f}%")
        print(f"  Assumed Actual Cumulative (6m): {assumed_cum_6m:.2f}%")
        print(f"  Surplus/Deficit: {assumed_cum_6m - avg_rr:+.2f}%")
        
        # -------------------------------------------------------------------
        # KEY DIAGNOSTIC: Is the assumed actual return > or < required return?
        # -------------------------------------------------------------------
        print(f"\n  >>> DIAGNOSTIC SUMMARY <<<")
        if wa > wb:
            print(f"  Forecast: Actual ({wa:.2f}%) > Benchmark ({wb:.2f}%) = AHEAD of target")
        else:
            print(f"  Forecast: Actual ({wa:.2f}%) < Benchmark ({wb:.2f}%) = BEHIND target")
        
        if assumed_cum_6m > avg_rr:
            print(f"  Required: Assumed ({assumed_cum_6m:.2f}%) > Required ({avg_rr:.2f}%) = WILL BEAT target")
        else:
            print(f"  Required: Assumed ({assumed_cum_6m:.2f}%) < Required ({avg_rr:.2f}%) = WON'T BEAT target")
        
        # Check for contradiction
        if (wa > wb) and (assumed_cum_6m < avg_rr):
            print(f"\n  *** CONTRADICTION DETECTED! ***")
            print(f"  The forecast says we're AHEAD, but required returns say")
            print(f"  our assumed returns are NOT ENOUGH to beat the target.")
            print(f"  This is the bug the user reported.")
            print(f"\n  ROOT CAUSE ANALYSIS:")
            print(f"  The Required Returns table uses forecastData.BENCHMARK as the target.")
            print(f"  The benchmark rolling return includes the user's INFLATION assumption,")
            print(f"  compounded over the full rolling window including new forecast months.")
            print(f"  It then back-solves for what ACTUAL return is needed to match that.")
            print(f"  But the ACTUAL forecast already uses a different (possibly higher)")
            print(f"  return assumption for the forecast period.")
            print(f"")
            print(f"  The required return calculation asks: how much actual return is needed")
            print(f"  in the future months to make the 8-year rolling actual = 8-year rolling")
            print(f"  benchmark? This uses ONLY historical actual data + the unknown future.")
            print(f"")
            print(f"  The forecast calculation uses the user's ASSUMED actual return for the")
            print(f"  future months. If the assumed actual > assumed benchmark, the portfolio")
            print(f"  will be ahead. But the required return is asking a different question:")
            print(f"  what return is needed for actual = benchmark, using ONLY historical")
            print(f"  actual data (not the forecast assumed actual).")
            print(f"")
            print(f"  So the 4.46% required cumulative INCLUDES the drag from old historical")
            print(f"  months dropping out of the 8-year window AND the contribution needed.")
            print(f"  Meanwhile the ~{assumed_cum_6m:.1f}% assumed actual IS enough to beat the")
            print(f"  benchmark because the historical actual is already strong enough")
            print(f"  that even with lower future returns, the rolling actual > rolling benchmark.")
        
        elif (wa > wb) and (assumed_cum_6m >= avg_rr):
            print(f"\n  NO CONTRADICTION - forecast and required returns are consistent.")
            print(f"  Assumed cumulative return ({assumed_cum_6m:.2f}%) exceeds required ({avg_rr:.2f}%).")
        
        print()

    # -------------------------------------------------------------------
    # KEY TEST: Demonstrate the FUM-weighted aggregation bug
    # -------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("BUG DEMONSTRATION: FUM-weighted Required Returns Aggregation")
    print("=" * 80)
    
    print("""
    The "All Clients (FUM-weighted)" row in the Required Returns table computes:
      weighted_required = Σ (fum_i × required_cumulative_i) / Σ fum_i

    But this is NOT the same as asking: "What aggregate return is needed for
    the FUM-weighted actual rolling return to match the FUM-weighted benchmark?"

    Due to Jensen's inequality (non-linearity of compounding and annualization),
    these two can give contradictory signals.

    PROOF: For each individual client, the relationship is always consistent:
      - If forecast shows client ahead → assumed > required (always true)
      - If forecast shows client behind → assumed < required (always true)

    But the FUM-weighted aggregation can combine clients that are ahead and behind
    such that:
      - Weighted actual > weighted benchmark (portfolio "ahead")
      - Yet weighted avg of required returns > assumed return ("not enough")

    This is mathematically possible when clients that are ahead have low FUM and
    extreme surplus (pulling the weighted required down), while clients that are
    behind have high FUM and moderate deficit (pulling weighted required up).
    The annualization function makes the weighted actual more sensitive to the
    strong performers, while the weighted required average is linear.
    """)

    # Verify per-client consistency
    print("  Per-client consistency check (Default scenario: 2.0% actual, 1.0% CPI):")
    actual_quarterly = 2.0
    cpi_quarterly = 1.0
    objective_annual = 4.0
    benchmark_annual_target = objective_annual + (cpi_quarterly * 4)
    actual_annual_target = actual_quarterly * 4
    benchmark_monthly = (math.pow(1 + benchmark_annual_target / 100, 1/12) - 1) * 100
    actual_monthly = (math.pow(1 + actual_annual_target / 100, 1/12) - 1) * 100
    months_q2 = 6
    
    all_consistent = True
    for client_name, client in clients.items():
        rolling_years = rolling_config.get(client_name, 8)
        actual = list(client['actual'])
        benchmark = list(client['benchmark'])
        
        actual_combined = actual[:]
        benchmark_combined = benchmark[:]
        for m in range(months_q2):
            actual_combined.append(actual_monthly)
            benchmark_combined.append(benchmark_monthly)
        
        if client_name == 'VIF' or rolling_years == 'inception':
            actual_since = actual_combined[VIF_INCEPTION_INDEX:]
            benchmark_since = benchmark_combined[VIF_INCEPTION_INDEX:]
            months_since = len(actual_since)
            actual_rolling = annualize_return(actual_since, months_since)
            benchmark_rolling = annualize_return(benchmark_since, months_since)
        else:
            rolling_months = int(rolling_years) * 12
            window_actual = actual_combined[-rolling_months:]
            window_benchmark = benchmark_combined[-rolling_months:]
            actual_rolling = annualize_return(window_actual, rolling_months)
            benchmark_rolling = annualize_return(window_benchmark, rolling_months)
        
        # Calculate required cumulative (same logic as dashboard)
        if client_name == 'VIF' or rolling_years == 'inception':
            hist_months = len(client['actual']) - VIF_INCEPTION_INDEX
            total_months = hist_months + months_q2
            future_months = months_q2
            hist_product = 1.0
            for i in range(VIF_INCEPTION_INDEX, len(client['actual'])):
                val = client['actual'][i]
                if val is not None:
                    hist_product *= (1 + val / 100)
        else:
            rolling_months = int(rolling_years) * 12
            total_months = rolling_months
            hist_needed = rolling_months - months_q2
            hist_in_window = min(hist_needed, len(client['actual']))
            future_months = rolling_months - hist_in_window
            hist_product = 1.0
            start_idx = len(client['actual']) - hist_in_window
            for i in range(start_idx, len(client['actual'])):
                val = client['actual'][i]
                if val is not None and i >= 0:
                    hist_product *= (1 + val / 100)
        
        target_annual = benchmark_rolling
        target_compounded = math.pow(1 + target_annual / 100, total_months / 12)
        req_future_product = target_compounded / hist_product
        req_monthly = (math.pow(req_future_product, 1 / future_months) - 1) * 100
        req_cumulative = (math.pow(1 + req_monthly / 100, months_q2) - 1) * 100
        assumed_cumulative = (math.pow(1 + actual_monthly / 100, months_q2) - 1) * 100
        
        ahead = actual_rolling > benchmark_rolling
        assumed_gt_required = assumed_cumulative > req_cumulative
        consistent = ahead == assumed_gt_required
        if not consistent:
            all_consistent = False
        
        status = "✓" if consistent else "✗ BUG"
        print(f"    {client_name:6s}: Ahead={ahead}, Assumed({assumed_cumulative:.2f}%)>"
              f"Required({req_cumulative:.2f}%)={assumed_gt_required} → {status}")
    
    print(f"\n  All per-client results consistent: {all_consistent}")
    if all_consistent:
        print("  ✓ Per-client logic is CORRECT — no bug in individual calculations.")
    
    # Now show the aggregation issue
    print(f"\n  --- AGGREGATION ISSUE ---")
    print(f"  The per-client logic is correct, but the FUM-weighted aggregation")
    print(f"  in the 'All Clients' row can appear contradictory because:")
    print(f"  1. FUM-weighted avg of annualized returns (forecast chart) is non-linear")
    print(f"  2. FUM-weighted avg of required cumulative returns (table) is linear")
    print(f"  3. These two averages answer fundamentally different questions")
    
    # Compute what the CORRECT aggregate required return should be
    print(f"\n  --- CORRECT AGGREGATE REQUIRED RETURN ---")
    print(f"  Instead of averaging per-client required returns, we should:")
    print(f"  1. Take the FUM-weighted benchmark rolling return from the forecast")
    print(f"  2. Back-solve: what aggregate actual is needed to match it?")
    print(f"  3. OR: compare assumed actual rolling to benchmark rolling directly")
    
    # Compute FUM-weighted forecast values
    total_fum = sum(fum_values.values())
    w_actual = sum(forecast_results[cn]['actual'] * fum_values[cn] 
                   for cn in clients if forecast_results[cn]['actual'] is not None) / total_fum
    w_benchmark = sum(forecast_results[cn]['benchmark'] * fum_values[cn]
                      for cn in clients if forecast_results[cn]['benchmark'] is not None) / total_fum
    
    print(f"\n  FUM-Weighted Forecast at {q2_label}:")
    print(f"    Actual rolling:    {w_actual:.2f}% p.a.")
    print(f"    Benchmark rolling: {w_benchmark:.2f}% p.a.")
    print(f"    Portfolio is {'AHEAD' if w_actual > w_benchmark else 'BEHIND'} by {w_actual - w_benchmark:+.2f}%")
    
    print(f"\n  The correct answer for 'All Clients' is:")
    if w_actual >= w_benchmark:
        print(f"    The portfolio is already ON TRACK to beat the weighted benchmark.")
        print(f"    No additional return is 'required' -- any positive return will do.")
    else:
        print(f"    The portfolio is behind. A higher return is needed.")
    
    # -------------------------------------------------------------------
    # BISECTION FIX VERIFICATION
    # -------------------------------------------------------------------
    print(f"\n  --- BISECTION FIX: Correct Aggregate Required Return ---")
    
    def compute_weighted_actual_rolling(candidate_monthly):
        """Given a candidate monthly return for all clients, compute FUM-weighted actual rolling."""
        w_act = 0
        w_fum = 0
        for cn, cl in clients.items():
            fum = fum_values.get(cn, 0)
            if fum <= 0:
                continue
            ry = rolling_config.get(cn, 8)
            actual_combined = list(cl['actual']) + [candidate_monthly] * months_q2
            if cn == 'VIF' or ry == 'inception':
                sl = actual_combined[VIF_INCEPTION_INDEX:]
                ar = annualize_return(sl, len(sl))
            else:
                rm = int(ry) * 12
                if len(actual_combined) >= rm:
                    ar = annualize_return(actual_combined[-rm:], rm)
                else:
                    ar = None
            if ar is not None:
                w_act += ar * fum
                w_fum += fum
        return w_act / w_fum if w_fum > 0 else None
    
    lo, hi = -5.0, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2
        result = compute_weighted_actual_rolling(mid)
        if result is None:
            break
        if result < w_benchmark:
            lo = mid
        else:
            hi = mid
        if abs(hi - lo) < 1e-10:
            break
    
    required_monthly_bisection = (lo + hi) / 2
    required_cumulative_bisection = (math.pow(1 + required_monthly_bisection / 100, months_q2) - 1) * 100
    actual_cumulative_assumed = (math.pow(1 + actual_monthly / 100, months_q2) - 1) * 100
    
    print(f"    Required monthly return (bisection): {required_monthly_bisection:.4f}%")
    print(f"    Required cumulative (6m, bisection): {required_cumulative_bisection:.2f}%")
    print(f"    Assumed actual cumulative (6m):       {actual_cumulative_assumed:.2f}%")
    
    if actual_cumulative_assumed >= required_cumulative_bisection:
        print(f"    CONSISTENT: Assumed ({actual_cumulative_assumed:.2f}%) >= Required ({required_cumulative_bisection:.2f}%)")
        if w_actual >= w_benchmark:
            print(f"    Both agree: portfolio is ON TRACK.")
        else:
            print(f"    ERROR: Assumed >= Required but portfolio is behind?!")
    else:
        print(f"    CONSISTENT: Assumed ({actual_cumulative_assumed:.2f}%) < Required ({required_cumulative_bisection:.2f}%)")
        if w_actual < w_benchmark:
            print(f"    Both agree: portfolio is BEHIND.")
        else:
            print(f"    ERROR: Assumed < Required but portfolio is ahead?!")
    
    # -------------------------------------------------------------------
    # ADDITIONAL: Verify the annualize_return function
    # -------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("VERIFICATION: annualize_return function")
    print("=" * 80)
    
    r = annualize_return([1.0] * 12, 12)
    expected = (1.01 ** 12 - 1) * 100
    print(f"  12 months of 1%/month: {r:.4f}% (expected: {expected:.4f}%)")
    
    r2 = annualize_return([1.0] * 24, 24)
    expected2 = (1.01 ** 12 - 1) * 100
    print(f"  24 months of 1%/month: {r2:.4f}% (expected: {expected2:.4f}%)")
    
    r3 = annualize_return([0.5] * 96, 96)
    expected3 = ((1.005 ** 96) ** (12/96) - 1) * 100
    print(f"  96 months of 0.5%/month: {r3:.4f}% (expected: {expected3:.4f}%)")
    
    # -------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("CONCLUSION & RECOMMENDED FIX")
    print("=" * 80)
    print("""
    ROOT CAUSE: The 'All Clients (FUM-weighted)' row in the Required Returns Table
    computes the simple FUM-weighted average of per-client required cumulative returns.
    This is mathematically incorrect because:

    1. Per client, the required return is a non-linear function of that client's
       historical compound product relative to its benchmark.
    2. Averaging these non-linear quantities across clients with FUM weights does
       NOT produce the required return for the aggregate portfolio.
    3. The forecast chart correctly computes FUM-weighted rolling returns using
       annualized per-client values, which is also non-linear but uses a different
       formula.

    RESULT: The Required Returns table can show a weighted required return of, say,
    4.46%, and the user's assumed return is below that, yet the forecast chart shows
    the portfolio is ahead. Both are individually correct calculations, but the
    weighted required return answers the wrong question.

    RECOMMENDED FIX:
    Option A (Simple): Add a status indicator to the All Clients row showing
             "On Track" / "Behind" based on the forecast chart's weighted actual
             vs weighted benchmark comparison.
    Option B (Better): Recompute the All Clients required return by:
             1. Computing the FUM-weighted benchmark rolling return (from forecast)
             2. For each candidate monthly return, compute what FUM-weighted actual
                rolling return would result
             3. Find the monthly return where weighted actual = weighted benchmark
             4. Display that as the aggregate required return
    Option C (Simplest): Replace the weighted average with a direct comparison note:
             "Weighted Actual X.XX% vs Weighted Benchmark Y.YY% = Z.ZZ% surplus/deficit"
    """)
    
    print("Done.")


if __name__ == '__main__':
    run_test()
