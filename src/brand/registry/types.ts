export type RegistryItem = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  quantity: number;
  purchased: number;
  held: number;
  remaining: number;
  favourite: boolean;
  amountMinor?: number;
  currency?: string;
  size?: string;
  unavailable?: string;
};
export type Delivery = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  countryCode: "IN" | "US";
};
export type RegistryView = {
  code: string;
  title: string;
  kind: "baby" | "gift";
  occasion: string;
  eventDate: string;
  message: string;
  closed: boolean;
  isOwner: boolean;
  countryCode: string;
  items: RegistryItem[];
  delivery?: Delivery;
  thanks?: {
    order: string;
    name: string;
    email: string;
    message: string;
    date: number;
    itemId: string;
  }[];
};
export const registryMoney = (currency: string, minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    minor / 100,
  );
