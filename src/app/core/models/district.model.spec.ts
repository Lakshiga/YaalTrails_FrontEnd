import { provinceOf } from './district.model';

describe('provinceOf', () => {
  it('reads the province from the district code', () => {
    expect(provinceOf('LK-41')).toBe(4); // Jaffna — Northern
    expect(provinceOf('LK-21')).toBe(2); // Kandy — Central
    expect(provinceOf('LK-11')).toBe(1); // Colombo — Western
    expect(provinceOf('LK-92')).toBe(9); // Kegalle — Sabaragamuwa
  });

  it('returns null for anything that is not a district code', () => {
    expect(provinceOf('home')).toBeNull();
    expect(provinceOf('LK-4')).toBeNull();
    expect(provinceOf('')).toBeNull();
  });
});
