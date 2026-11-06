export type Cents  = number;

export function toCents(input: string): Cents {
    if (!/^\d+(\.\d{1,2})?$/.test(input)) throw new Error("Invalid amount");
    const [dollars, frac = ''] = input.split('.');
    const cents = Number(dollars) * 100 + Number(frac.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents)) throw new Error("Amount too large");
    return cents;
}