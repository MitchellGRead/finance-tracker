# CSV Statement Formats

The system supports two statement formats. Both are normalized into the same `line_item` shape during import.

## American Express

**Has headers.** First row: `Date,Date Processed,Description,Card Member,Account #,Amount`

### Sample
```csv
Date,Date Processed,Description,Card Member,Account #,Amount
23 Dec 2025,23 Dec 2025,MEMBERSHIP FEE INSTALLMENT,JOHN DOE,-12555,12.99
22 Dec 2025,23 Dec 2025,ORIGIN GLUTEN-FREE BAKE VICTORIA,JOHN DOE,-12555,27.37
22 Dec 2025,23 Dec 2025,PARSONAGE CAFE #8248473 VICTORIA,JOHN DOE,-12555,45.64
```

### Field Mapping
| CSV Column | Maps To | Notes |
|-----------|---------|-------|
| Date | `line_item.date` | Format: `DD MMM YYYY` — parse to ISO 8601 |
| Date Processed | — | Not stored |
| Description | `line_item.description` | Raw text, used for rule matching |
| Card Member | — | Informational only; user assignment is at upload time |
| Account # | — | Not stored |
| Amount | `line_item.amount` | Always positive (charges) |

## TD

**No headers.** Columns are positional.

### Sample
```csv
10/05/2025,DAIRY QUEEN #27314,39.99,,555.65
10/02/2025,ISLAND POKE,17.75,,515.66
10/01/2025,PAYMENT - THANK YOU,,137.61,497.91
```

### Field Mapping
| Position | Content | Maps To | Notes |
|----------|---------|---------|-------|
| 0 | Date | `line_item.date` | Format: `MM/DD/YYYY` — parse to ISO 8601 |
| 1 | Description | `line_item.description` | Raw text, used for rule matching |
| 2 | Debit amount | `line_item.amount` | Charges — empty if this is a credit |
| 3 | Credit amount | — | Payments/refunds — rows with credit but no debit are still imported but can be auto-rejected via rules |
| 4 | Balance | — | Not stored |

### TD-Specific Handling
- Rows where the debit column is empty and credit column has a value are payment/refund rows (e.g., "PAYMENT - THANK YOU")
- These are still imported as line items (with the credit value as the amount) so that accept/reject rules can manage them
- Users will typically create a reject rule for patterns like "PAYMENT - THANK YOU"

## Normalization

Both parsers produce the same output shape for insertion:

```typescript
interface ParsedLineItem {
  date: string;          // ISO 8601 (YYYY-MM-DD)
  description: string;   // Raw from CSV
  amount: number;        // Positive value
  isCredit: boolean;     // True for TD credit rows
}
```

The `isCredit` flag allows the rule engine and UI to distinguish payments from charges during the review step.
