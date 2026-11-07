import { voucherCsvCell } from './vouchers';

describe('Voucher CSV output', () => {
  it('preserves Vietnamese names, commas and embedded quotes', () => {
    expect(voucherCsvCell('Sách cũ, "ưu đãi"')).toBe('"Sách cũ, ""ưu đãi"""');
  });
  it('neutralizes formulas even after whitespace', () => {
    for (const value of ['=1+1', '  =1+1', '\n=1+1', '\t+1', '\r-1', ' @SUM(1)', '-1']) {
      expect(voucherCsvCell(value)).toBe('"\'' + value + '"');
    }
  });
  it('keeps ordinary numeric and empty cells intact', () => {
    expect(voucherCsvCell(100000)).toBe('"100000"');
    expect(voucherCsvCell('')).toBe('""');
  });
});
