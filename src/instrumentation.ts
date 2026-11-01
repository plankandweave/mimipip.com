import { installOfflineFetchBoundary } from './brand/network-policy';
/** Next's startup entry. This does not enable or bypass the source-copy setup guard. */
export function register() { installOfflineFetchBoundary(); }
