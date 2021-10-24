import * as client from "pkgcloud"
import { Customer } from "../../domain/vCustomer";
import {SwiftClient} from "../../lib/swiftsdk/swiftsdk"
import { SwiftCredentials } from "../../domain/vSwiftCredentials";

export interface ISwiftConnector {
    Connect(creds: SwiftCredentials): Promise<SwiftClient>
}

function Connect(creds: SwiftCredentials): Promise<SwiftClient> {
    return Promise.resolve(new SwiftClient(creds.endpoint, creds.projectId, creds.user, creds.password))
}

export function NewSwiftConnector() : ISwiftConnector { return {
    Connect,
}
}