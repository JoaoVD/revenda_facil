export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string;
  stock: number;
  salePrice: string;
  referenceCost: string;
  imageUrl?: string | null;
};
