// Shop kinds by merchant category code (11 S11-30): fallback labels, move help text and the category
// word in parent alerts (14). The envelope each code maps to is the contract's (01 section 3).

export type ShopKind = { label: string; plural: string | null; category: string };

const KINDS: Record<number, ShopKind> = {
  5411: { label: "Supermarket", plural: "Supermarkets", category: "groceries" },
  5812: { label: "Restaurant", plural: "Restaurants", category: "restaurant" },
  5814: { label: "Canteen", plural: "Canteens", category: "canteen" },
  4111: { label: "Tram and train", plural: "Trams and trains", category: "public transport" },
  4121: { label: "Taxi", plural: "Taxis", category: "ride-hailing" },
  5541: { label: "Fuel station", plural: "Fuel stations", category: "fuel" },
  5542: { label: "Fuel station", plural: "Fuel stations", category: "fuel" },
  5943: { label: "Stationery shop", plural: "Stationery shops", category: "stationery" },
  7338: { label: "Print shop", plural: "Print shops", category: "printing" },
  8299: { label: "Course", plural: "Courses", category: "course fees" },
  5942: { label: "Bookshop", plural: "Bookshops", category: "bookshop" },
  7832: { label: "Cinema", plural: "Cinemas", category: "cinema" },
  7995: { label: "Gambling site", plural: "Gambling sites", category: "gambling" },
};

const OTHER: ShopKind = { label: "Card purchase", plural: null, category: "other" };

export function shopKind(mcc: number): ShopKind {
  return KINDS[mcc] ?? OTHER;
}
