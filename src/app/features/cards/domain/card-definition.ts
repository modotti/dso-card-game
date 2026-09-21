export interface CardImageReference {
  readonly src: string;
  readonly credit: string;
  readonly license?: string;
}

export interface CardDefinition {
  readonly kind: 'astronomical';
  readonly id: string;
  readonly catalogName: string;
  readonly commonName: string;
  readonly objectType: string;
  readonly constellation: string;
  readonly images: readonly CardImageReference[];
  readonly attributes: Readonly<Record<string, number>>;
  readonly sourceUrl: string;
}
