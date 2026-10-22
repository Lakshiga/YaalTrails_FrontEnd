import { shortLabel } from './map-common';

describe('shortLabel', () => {
  it('keeps the part before the first comma', () => {
    expect(shortLabel('Casuarina Beach, Karainagar')).toBe('Casuarina Beach');
  });

  it('shortens long names with an ellipsis', () => {
    const label = shortLabel('Muthirai Santhai (Jaffna Central Market)');
    expect(label.length).toBe(28);
    expect(label.endsWith('…')).toBeTrue();
  });

  it('leaves short names alone', () => {
    expect(shortLabel('Jaffna Fort')).toBe('Jaffna Fort');
  });
});
