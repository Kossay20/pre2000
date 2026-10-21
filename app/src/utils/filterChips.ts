/**
 * The filter row on the articles and supplements lists: "★ Favorites", "All", then one
 * chip per category (or safety rating). It is one choice, so exactly one chip is lit.
 * Favorites used to be a separate toggle on top of the row, which left "All" lit next to
 * it and read as two filters at once.
 */
export type FilterChip<T> = { type: 'favorites' } | { type: 'all' } | { type: 'value'; value: T };

export interface FilterSelection<T> {
    favorites: boolean;
    value: T | null;
}

export const NO_FILTER: FilterSelection<never> = { favorites: false, value: null };

/** The selection after a chip is pressed. Pressing the lit chip again goes back to "All". */
export function pressFilterChip<T>(current: FilterSelection<T>, chip: FilterChip<T>): FilterSelection<T> {
    switch (chip.type) {
        case 'favorites':
            return current.favorites ? { favorites: false, value: null } : { favorites: true, value: null };
        case 'all':
            return { favorites: false, value: null };
        case 'value':
            return !current.favorites && current.value === chip.value
                ? { favorites: false, value: null }
                : { favorites: false, value: chip.value };
    }
}

export function isFilterChipSelected<T>(current: FilterSelection<T>, chip: FilterChip<T>): boolean {
    switch (chip.type) {
        case 'favorites':
            return current.favorites;
        case 'all':
            return !current.favorites && current.value === null;
        case 'value':
            return !current.favorites && current.value === chip.value;
    }
}

/**
 * What an empty list says. An empty Favorites view is not a failed search — it used to
 * read `No results for ""`.
 */
export function emptyListMessage(
    current: FilterSelection<unknown>,
    query: string,
): { key: 'favoritesEmpty' | 'noResultsFor' | 'noResults' } {
    if (query.trim()) return { key: 'noResultsFor' };
    if (current.favorites) return { key: 'favoritesEmpty' };
    return { key: 'noResults' };
}
