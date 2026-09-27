import type { Driver, PickupMethod, Recipient } from '../types';
import { PICKUP_METHODS } from './catalog';
import { HANDOVER_MINUTES, travelMinutes } from './geo';

export interface PickupPlan {
  /** Minutes between the scheduled time and the food actually landing. */
  leadMinutes: number;
  arrivalAt: number;
  onTime: boolean;
  /** Minutes of slack before the food expires. */
  slackMinutes: number;
  problems: string[];
  warnings: string[];
}

export function pickupLeadMinutes(
  method: PickupMethod,
  recipient: Recipient,
  driver: Driver | undefined,
  km: number,
): number {
  const response =
    method === 'volunteer_driver'
      ? (driver?.avgResponseMinutes ?? 30)
      : method === 'recipient_pickup'
        ? recipient.avgResponseMinutes
        : PICKUP_METHODS.donor_dropoff.leadTime;
  return response + travelMinutes(km) + HANDOVER_MINUTES;
}

export function planPickup(params: {
  method: PickupMethod;
  recipient: Recipient;
  driver?: Driver;
  km: number;
  scheduledFor: number;
  expiresAt: number;
  quantityKg: number;
  requiresCold: boolean;
}): PickupPlan {
  const { method, recipient, driver, km, scheduledFor, expiresAt, quantityKg, requiresCold } = params;
  const leadMinutes = pickupLeadMinutes(method, recipient, driver, km);
  const arrivalAt = scheduledFor + leadMinutes * 60_000;
  const slackMinutes = (expiresAt - arrivalAt) / 60_000;
  const problems: string[] = [];
  const warnings: string[] = [];

  if (slackMinutes < 0) {
    problems.push(
      `Estimated arrival is ${Math.abs(Math.round(slackMinutes))} minutes after the food expires.`,
    );
  }

  if (method === 'volunteer_driver') {
    if (!driver) {
      problems.push('No driver selected for this run.');
    } else {
      if (!driver.onShift) problems.push(`${driver.name} is not on shift.`);
      if (driver.capacityKg < quantityKg)
        problems.push(
          `${driver.name}'s ${driver.vehicle} carries ${driver.capacityKg} kg — this load is ${Math.round(quantityKg)} kg.`,
        );
      if (requiresCold && !driver.refrigerated)
        warnings.push(
          `${driver.name}'s vehicle is not refrigerated. The cold chain would break on this load.`,
        );
      if (driver.capacityKg < quantityKg * 1.15 && driver.capacityKg >= quantityKg)
        warnings.push('The run leaves almost no spare capacity in the vehicle.');
    }
  }

  if (requiresCold && method === 'donor_dropoff') {
    warnings.push('Confirm the donor vehicle is chilled before the load leaves the site.');
  }

  return { leadMinutes, arrivalAt, onTime: problems.length === 0, slackMinutes, problems, warnings };
}
