// This virtual module is resolved ONLY from the verified production Git blob.
import legacy from 'salta:production-stats';
import {createStatsGateway} from './gateway.mjs';
export default createStatsGateway(legacy);
