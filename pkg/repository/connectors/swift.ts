import * as client from "pkgcloud"
import { Customer } from "../../domain/vCustomer";
import { PhotocloudAuthenticatedCustomer } from "../photocloudAPI/authenticatedCustomer";
import {SwiftClient} from "../../lib/swiftsdk/swiftsdk"
import { SwiftCredentials } from "../../domain/vSwiftCredentials";


function Connect(creds: SwiftCredentials): Promise<SwiftClient> {
    return Promise.resolve(new SwiftClient(creds.endpoint, creds.projectId, creds.user, creds.password))
}

export const SwiftConnector = {
    Connect,
}