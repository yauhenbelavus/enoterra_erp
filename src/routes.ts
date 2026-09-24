export type AppTab = 'inventory' | 'clients' | 'orders' | 'inventoryStatus';

export type AppSubTab =
  | 'przyjecie'
  | 'analiza'
  | 'kalendarz'
  | 'wydanie'
  | 'rezerwacje'
  | 'analiza_towarow'
  | 'analiza_wydan'
  | 'faktury'
  | 'komis'
  | 'baza_klientow'
  | 'sprzedaz_klientom'
  | 'towary'
  | 'analiza_magazynu'
  | null;

export const HOME_PATH = '/';
export const ZAKUP_PATH = '/zakup';
export const ZAKUP_NOWE_PATH = '/zakup/nowe';
export const getZakupEdycjaPath = (id: number | string) => `/zakup/${id}/edycja`;
export const getZakupEdycjaId = (pathname: string): number | null => {
  const match = pathname.match(/^\/zakup\/(\d+)\/edycja$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
};
export const KLIENCI_PATH = '/klienci';
export const STANY_PATH = '/stany';
export const PRE_ROUTED_TAB_KEY = 'preRoutedTab';

const TAB_PATHS: Record<AppTab, string> = {
  orders: HOME_PATH,
  inventory: ZAKUP_PATH,
  clients: KLIENCI_PATH,
  inventoryStatus: STANY_PATH,
};

const SUB_TABS_BY_TAB: Partial<Record<AppTab, readonly AppSubTab[]>> = {
  inventory: ['przyjecie', 'analiza', 'kalendarz'],
  clients: ['baza_klientow', 'sprzedaz_klientom'],
  orders: ['wydanie', 'rezerwacje', 'analiza_towarow', 'faktury', 'komis', 'analiza_wydan'],
  inventoryStatus: ['towary', 'analiza_magazynu'],
};

export const getDefaultSubTab = (tab: AppTab): AppSubTab => {
  if (tab === 'orders') return 'wydanie';
  if (tab === 'clients') return 'baza_klientow';
  if (tab === 'inventory') return 'przyjecie';
  if (tab === 'inventoryStatus') return 'towary';
  return null;
};

export const getTabFromPathname = (pathname: string): AppTab | null => {
  if (pathname === ZAKUP_PATH || pathname.startsWith(`${ZAKUP_PATH}/`)) {
    return 'inventory';
  }
  if (pathname === KLIENCI_PATH || pathname.startsWith(`${KLIENCI_PATH}/`)) {
    return 'clients';
  }
  if (pathname === STANY_PATH || pathname.startsWith(`${STANY_PATH}/`)) {
    return 'inventoryStatus';
  }
  if (pathname === HOME_PATH) {
    return 'orders';
  }
  return null;
};

export const getPathForTab = (tab: AppTab): string => TAB_PATHS[tab];

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
