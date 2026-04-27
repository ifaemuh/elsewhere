export interface Destination {
  id: string;
  name: string;
  country: string;
  teaser: string;
  flightCost: number;
  hotelCost: number;
  activityCost: number;
  transferCost: number;
  partnerFee: number;
  isFeatured: boolean;
  previewImageUrl: string | null;
  createdAt: string;
}

export function totalCost(d: Destination): number {
  return d.flightCost + d.hotelCost + d.activityCost + d.transferCost + d.partnerFee;
}
