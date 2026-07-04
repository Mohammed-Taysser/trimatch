import { parseWsOrigins } from './redis-io.adapter';

// 869dzymvy: WS_CORS_ORIGIN is a comma-separated allow-list; the parser must
// yield a clean array so the Socket.IO server only accepts those browser origins.
describe('parseWsOrigins turns the env allow-list into an array', () => {
  it('parses a single origin', () => {
    expect(parseWsOrigins('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });

  it('splits and trims a comma-separated list', () => {
    expect(parseWsOrigins('https://app.example.com, https://admin.example.com')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('drops empty entries from stray commas or whitespace', () => {
    expect(parseWsOrigins('https://app.example.com, ,')).toEqual(['https://app.example.com']);
  });
});
