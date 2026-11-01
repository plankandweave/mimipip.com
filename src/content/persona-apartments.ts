export type PersonaApartment = {
 slug: string; title: string; description: string; story: string;
 rooms: { key: string; name: string; title: string; note: string; wipeable: boolean; room: string; artwork: string; handle: string }[];
};

export const PERSONA_APARTMENTS: PersonaApartment[] = [];

export const getPersonaApartment = (slug: string) => PERSONA_APARTMENTS.find(home => home.slug === slug);
