# Pricing rules

## Rules used by the API

`base_price` is a per-unit starting price. For `quantity_tiers` and `combined` models, the first and only matching tier's `unit_price` replaces the base price. If no tier matches, the base price is used. `options` applies selected option adjustments to base price; `base` does not apply option adjustments. `combined` applies eligible adjustments after choosing the tier or base price. `quantity_tiers` does not apply option adjustments.

Eligible option adjustments are applied in the request's `selectedOptions` order, and selected values within a multi-select group follow their array order. A fixed adjustment adds its configured amount. A percentage adjustment applies to the current per-unit amount, then rounds to cents before the next adjustment. The final per-unit price is multiplied by quantity. The backend calculates in integer cents with `BigInt`; monetary values in its response are decimal strings to preserve exact cents.

Formula:

```text
starting unit price = matching tier unit price, if applicable; otherwise base price
after each eligible option:
  fixed      -> current unit price + configured amount
  percentage -> round(current unit price × (1 + configured percentage / 100), 2)
subtotal = final unit price × quantity
```

Examples using the sample catalogue:

1. A Custom Vinyl Sticker with Large (+3.00) and Gloss (+1.50) uses its 5.00 base: `5.00 + 3.00 + 1.50 = 9.50` per unit. At quantity 100, subtotal is `950.00`.
2. Product Labels at quantity 100 use the 100–499 tier price of 0.09 instead of the 12.00 base. Selecting Vinyl (+4.00) and Gloss (+2.00) yields `0.09 + 4.00 + 2.00 = 6.09` per unit, subtotal `609.00`.
3. A 10.00 starting price with sequential +10% and −10% adjustments becomes 11.00, then 9.90 (the second adjustment applies to the updated amount). At quantity 2, subtotal is `19.80`.

## Validation and schema limits

The API reads current product, group, value, and tier records from Supabase for every calculation. It rejects inactive/missing products, option values outside the product, inactive values, missing required choices, duplicate groups/values, multiple values for a `select`, invalid input types, non-positive/non-integer quantities, negative resulting prices, malformed tier ranges, and overlapping tiers. A quantity with no matching tier falls back to base price.

The schema has no numeric input minimum/maximum columns or multi-select count limits. Therefore numeric custom inputs must be finite numbers, and multi-select permits any set of distinct active values. Required text inputs must be nonblank; colors must be hex colors. Custom inputs are returned in the breakdown but never change the price. Adding configurable input bounds would require a future schema change.

The database has no currency column. The API returns a currency code from `PRICE_CURRENCY`, defaulting to `INR`; set that server environment variable to another three-letter ISO currency code if the business uses a different currency. The sample numeric prices themselves do not encode currency.
