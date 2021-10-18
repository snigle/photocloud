import { Customer } from "./vCustomer"
import { Plan } from "./vPlan"
import { S3Credentials } from "./vS3Credentials"
import { SwiftCredentials } from "./vSwiftCredentials"

export type Subscription = {
    customerId: string,
    billedUntil: Date | null,
    plan: Plan,
    status: string,
}
