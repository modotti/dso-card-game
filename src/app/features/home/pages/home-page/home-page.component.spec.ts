import { pickFeaturedCards } from './home-page.component';

describe('pickFeaturedCards', () => {
  const cards = [
    { id: '1', catalogName: 'One', commonName: 'One', objectType: 'nebula' },
    { id: '2', catalogName: 'Two', commonName: 'Two', objectType: 'nebula' },
    { id: '3', catalogName: 'Three', commonName: 'Three', objectType: 'galaxy' },
    { id: '4', catalogName: 'Four', commonName: 'Four', objectType: 'cluster' },
  ];

  it('picks distinct cards and prioritizes different object types', () => {
    const selected = pickFeaturedCards(cards, 3, () => 0.5);

    expect(selected).toHaveSize(3);
    expect(new Set(selected.map((card) => card.id)).size).toBe(3);
    expect(new Set(selected.map((card) => card.objectType)).size).toBe(3);
  });

  it('falls back to repeated object types when needed', () => {
    const sameType = cards.slice(0, 2);

    expect(pickFeaturedCards(sameType, 3, () => 0.5)).toEqual(sameType);
  });
});
