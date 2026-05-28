import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { RELAY_MAX_RESERVATIONS, RELAY_RESERVATION_TTL } from './config.js';

export const createRelay: any = () => circuitRelayServer({
    reservations: {
        maxReservations: RELAY_MAX_RESERVATIONS,
        reservationTtl: RELAY_RESERVATION_TTL
    }
});