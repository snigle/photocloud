import { Customer } from "../../domain/vCustomer";
import fetch, {Response, RequestInit, Headers} from "node-fetch"
export let PhotocloudAPIEndpoint = "http://localhost:8080";

function Connect(access_token: string) {
    return async (input: string, init?: RequestInit): Promise<Response> => {
        const resp = await fetch(PhotocloudAPIEndpoint + input, init)
        return resp
    }
}

export const photocloudConnector = {
    Connect,
}