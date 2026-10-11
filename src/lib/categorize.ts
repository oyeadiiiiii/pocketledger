export const INVEST_RE = /\b(zerodha|groww|upstox|angel\s*one|kuvera|indmoney|smallcase|mutual\s*funds?|sip|nps|ppf|stocks?|demat)\b/i;

const RULES: Array<[RegExp, string]> = [
  [INVEST_RE, 'Invest'],
  [/\b(petrol|diesel|fuel|hpcl|bpcl|iocl|indian\s*oil|hp\s*pay|nayara|shell)\b/i, 'Petrol'],
  [/\b(swiggy|zomato|eatsure|dominos?|pizza|kfc|mcdonalds?|burger|starbucks|cafe|coffee|restaurant|biryani|dhaba|chai|bakery|samosa)\b/i, 'Food'],
  [/\b(blinkit|zepto|instamart|bigbasket|dmart|jiomart|grocery|groceries|kirana)\b/i, 'Groceries'],
  [/\b(uber|ola|rapido|metro|irctc|redbus|indigo|fastag|parking|cab|railways?|auto)\b/i, 'Transport'],
  [/\b(pharmacy|pharmeasy|apollo|medplus|1mg|netmeds|hospital|clinic|diagnostics?|doctor|chemist)\b/i, 'Medicine'],
  [/\b(amazon|flipkart|myntra|ajio|meesho|nykaa|decathlon|croma|tatacliq)\b/i, 'Shopping'],
  [/\b(airtel|jio|vodafone|vi|bsnl|recharge|electricity|broadband|dth|netflix|spotify|hotstar|youtube|icloud|insurance|lic|bill|billdesk)\b/i, 'Bills'],
  [/\b(udemy|coursera|unacademy|school|college|university|tuition|exam)\b/i, 'Education'],
  [/\b(bookmyshow|pvr|inox|cinepolis|movie|salon|haircut)\b/i, 'Misc.'],
];

export function suggestCategory(text: string): string | null {
  for (const [re, name] of RULES) if (re.test(text)) return name;
  return null;
}