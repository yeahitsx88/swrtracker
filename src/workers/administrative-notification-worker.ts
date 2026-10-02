import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {createEmailTransportFromEnv} from '@/lib/email';
import {dispatchAdministrativeNotifications} from '@/modules/identity/infrastructure/administrative-notification-outbox';
async function main(){try{const sent=await dispatchAdministrativeNotifications(pool,withTransaction,createEmailTransportFromEnv());console.log('Administrative review messages delivered: '+sent);}finally{await pool.end();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
