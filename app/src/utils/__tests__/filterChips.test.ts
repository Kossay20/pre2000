import { emptyListMessage, FilterChip, FilterSelection, isFilterChipSelected, NO_FILTER, pressFilterChip } from '../filterChips';

const CHIPS: FilterChip<string>[] = [
    { type: 'favorites' },
    { type: 'all' },
    { type: 'value', value: 'nutrition' },
    { type: 'value', value: 'sante' },
];

const lit = (s: FilterSelection<string>) => CHIPS.filter(c => isFilterChipSelected(s, c));

describe('filter chip row', () => {
    it('starts on "All" alone', () => {
        expect(lit(NO_FILTER)).toEqual([{ type: 'all' }]);
    });

    it('keeps exactly one chip lit whatever is pressed', () => {
        let s: FilterSelection<string> = NO_FILTER;
        const presses: FilterChip<string>[] = [
            { type: 'favorites' }, { type: 'value', value: 'sante' }, { type: 'favorites' },
            { type: 'favorites' }, { type: 'value', value: 'nutrition' }, { type: 'value', value: 'nutrition' },
            { type: 'favorites' }, { type: 'all' },
        ];
        for (const chip of presses) {
            s = pressFilterChip(s, chip);
            expect(lit(s)).toHaveLength(1);
        }
    });

    it('Favorites turns "All" off, and turning Favorites off returns to "All"', () => {
        const fav = pressFilterChip(NO_FILTER, { type: 'favorites' });
        expect(lit(fav)).toEqual([{ type: 'favorites' }]);
        expect(lit(pressFilterChip(fav, { type: 'favorites' }))).toEqual([{ type: 'all' }]);
    });

    it('a category replaces Favorites; pressing it again returns to "All"', () => {
        const fav = pressFilterChip(NO_FILTER, { type: 'favorites' });
        const cat = pressFilterChip(fav, { type: 'value', value: 'sante' });
        expect(cat).toEqual({ favorites: false, value: 'sante' });
        expect(pressFilterChip(cat, { type: 'value', value: 'sante' })).toEqual(NO_FILTER);
    });
});

describe('emptyListMessage', () => {
    it('an empty Favorites view is not a failed search', () => {
        expect(emptyListMessage({ favorites: true, value: null }, '')).toEqual({ key: 'favoritesEmpty' });
        expect(emptyListMessage({ favorites: true, value: null }, '  ')).toEqual({ key: 'favoritesEmpty' });
    });
    it('a search with no match names the query', () => {
        expect(emptyListMessage({ favorites: true, value: null }, 'fer')).toEqual({ key: 'noResultsFor' });
        expect(emptyListMessage(NO_FILTER, 'fer')).toEqual({ key: 'noResultsFor' });
    });
    it('a filter with no match and no query says so plainly', () => {
        expect(emptyListMessage({ favorites: false, value: 'deconseille' }, '')).toEqual({ key: 'noResults' });
    });
});
