// import ipc from "node-ipc";
import { NetstatMonitor } from "./processes/netstat";

const main = async () => {
    const netstat = new NetstatMonitor();
    await netstat.start(5000);
}

void main();