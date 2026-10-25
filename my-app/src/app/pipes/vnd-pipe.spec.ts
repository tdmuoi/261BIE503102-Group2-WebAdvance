import { VndPipe } from './vnd-pipe';

describe('VndPipe', () => {
  const pipe = new VndPipe();

  it('định dạng giá kiểu Việt Nam', () => {
    expect(pipe.transform(16000)).toBe('16.000đ');
    expect(pipe.transform(1250000)).toBe('1.250.000đ');
  });

  it('trả chuỗi rỗng khi không có giá', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
