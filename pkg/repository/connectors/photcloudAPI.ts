import { Customer } from "../../domain/vCustomer";
import fetch, {Response, RequestInit, Headers} from "node-fetch"
export let PhotocloudAPIEndpoint = "http://localhost:8080";

export interface IPhotocloudConnector {
    Connect: (access_token: string) => ((input: string, init?: RequestInit) => Promise<Response>)
}

function Connect(access_token: string) {
    return async (input: string, init?: RequestInit): Promise<Response> => {
        const resp = await fetch(PhotocloudAPIEndpoint + input, init)
        return resp
    }
}

const photocloudConnector = {
    Connect,
}

export function NewPhotocloudConnector(): IPhotocloudConnector {
    return photocloudConnector
}