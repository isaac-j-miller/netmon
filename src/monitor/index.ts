import ipc from "node-ipc";
import { NetstatMonitor } from "./processes/netstat";

ipc.config.id = "netmon"
ipc.serve(() => {
    console.log("serving netmon");
    ipc.server.on("http", (data) => {
        console.log("got", data)
    })
    const netstat = new NetstatMonitor();
    netstat.start(5000).then(() => {
        console.log("done")
    }).catch(err => {
        console.error(err)
        throw err;
    })
})

ipc.server.start();