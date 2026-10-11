export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  heroBg: string;
  heroText: string;
  heroMuted: string;
  income: string;
  expense: string;
  warning: string;
  accent: string;
  incomeSoft: string;
  expenseSoft: string;
  warningSoft: string;
  accentSoft: string;
  shadow: string;
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#F2F5FB',
  card: '#FFFFFF',
  cardAlt: '#E9EEF8',
  text: '#0B1530',
  textMuted: '#5B6785',
  border: '#DFE5F0',
  primary: '#0B1530',
  onPrimary: '#FFFFFF',
  heroBg: '#0B1530',
  heroText: '#FFFFFF',
  heroMuted: '#A9B6D8',
  income: '#16A34A',
  expense: '#DC2626',
  warning: '#B45309',
  accent: '#2563EB',
  incomeSoft: '#DCFCE7',
  expenseSoft: '#FEE2E2',
  warningSoft: '#FEF3C7',
  accentSoft: '#DBEAFE',
  shadow: '#0B1530',
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#060C1E',
  card: '#0F1A3A',
  cardAlt: '#17244C',
  text: '#F4F6FF',
  textMuted: '#9AA6C7',
  border: '#1E2C58',
  primary: '#F4F6FF',
  onPrimary: '#0B1530',
  heroBg: '#16244D',
  heroText: '#FFFFFF',
  heroMuted: '#A9B6D8',
  income: '#22C55E',
  expense: '#F87171',
  warning: '#FBBF24',
  accent: '#60A5FA',
  incomeSoft: '#0F3B24',
  expenseSoft: '#45161B',
  warningSoft: '#3D2E0A',
  accentSoft: '#172C55',
  shadow: '#000000',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 } as const;