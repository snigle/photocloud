import { Customer } from "../../domain/vCustomer";
import fetch, {Response, RequestInit, Headers} from "node-fetch"
export let PhotocloudAPIEndpoint = "http://localhost:8080";

interface ICache{
    clear(): void;
    getItem(key: string): string | null;
    key(index: number): string | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;
}

export interface ICacheConnector {
    Connect: () => ICache
}

export function NewCacheConnector(): ICacheConnector {
    return {
        Connect: () => localStorage
    }
}