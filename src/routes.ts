export type AppTab = 'inventory' | 'clients' | 'orders' | 'inventoryStatus';

export type AppSubTab =
  | 'przyjecie'
  | 'analiza'
  | 'kalendarz'
  | 'wydanie'
  | 'rezerwacje'
  | 'analiza_towarow'
  | 'faktury'
  | 'komis'
  | 'baza_klientow'
  | 'sprzedaz_klientom'
  | null;

export const ZAKUP_PATH = '/zakup';
export const KLIENCI_PATH = '/klienci';
export const PRE_ROUTED_TAB_KEY = 'preRoutedTab';

const TAB_PATHS: Partial<Record<AppTab, string>> = {
  inventory: ZAKUP_PATH,
  clients: KLIENCI_PATH,
};

const SUB_TABS_BY_TAB: Partial<Record<AppTab, readonly AppSubTab[]>> = {
  inventory: ['przyjecie', 'analiza', 'kalendarz'],
  clients: ['baza_klientow', 'sprzedaz_klientom'],
  orders: ['wydanie', 'rezerwacje', 'analiza_towarow', 'faktury', 'komis'],
};

export const getDefaultSubTab = (tab: AppTab): AppSubTab => {
  if (tab === 'orders') return 'wydanie';
  if (tab === 'clients') return 'baza_klientow';
  if (tab === 'inventory') return 'przyjecie';
  return null;
};

export const getTabFromPathname = (pathname: string): AppTab | null => {
  if (pathname === ZAKUP_PATH || pathname.startsWith(`${ZAKUP_PATH}/`)) {
    return 'inventory';
  }
  if (pathname === KLIENCI_PATH || pathname.startsWith(`${KLIENCI_PATH}/`)) {
    return 'clients';
  }
  return null;
};

export const getPathForTab = (tab: AppTab): string => TAB_PATHS[tab] ?? '/';

export const resolveSubTabForTab = (tab: AppTab, savedSubTab: string | null): AppSubTab => {
  const defaultSubTab = getDefaultSubTab(tab);
  const validSubTabs = SUB_TABS_BY_TAB[tab];

  if (
    savedSubTab &&
    validSubTabs?.includes(savedSubTab as AppSubTab)
  ) {
    return savedSubTab as AppSubTab;
  }

  return defaultSubTab;
};
