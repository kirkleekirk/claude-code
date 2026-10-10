// A PeerJS server of your own, to play or test online without the public one:
//   node tools/peer-server.mjs [port]      then add &peer=127.0.0.1:<port> to each player's address
// (on 127.0.0.1, so only this machine can use it; give a host as a second argument to share it)
import { PeerServer } from 'peer';
const port = parseInt(process.argv[2] || '9000', 10), host = process.argv[3] || '127.0.0.1';
PeerServer({ port, path: '/', host }, (s) => console.log(`PeerJS server on ${host}:${s.address().port}`));
