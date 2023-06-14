import fs from "fs"
import ipc from "node-ipc";
import { NetstatMonitor } from "./processes/netstat";
import { CommonConfig } from "../common/types";

ipc.config.stopRetrying = false;
ipc.config.silent = true;
ipc.config.id = "netmon"

const configFile = fs.readFileSync("./test/config.json", "utf-8");
const config = JSON.parse(configFile) as CommonConfig;

/**
 * TODO: store netstat logs, correlating them by LocalAddress port to determine connection start/end times.
 * Simultaneously, try to correlate http socket events with netstat logs by start time (and maybe end time?)
 * in order to determine which PID the process came from
 */

ipc.serve(() => {
    console.log("serving netmon");
    ipc.server.on("http", (data) => {
        // TODO: store these logs
        console.log("got", data)
    })
    // TODO: store these logs
    const netstat = new NetstatMonitor(config);
    netstat.start(100).then(() => {
        console.log("done")
    }).catch(err => {
        console.error(err)
        throw err;
    })
})

ipc.server.start();