import fetch, { Response, RequestInfo, RequestInit } from "node-fetch"
import { json } from "stream/consumers"

export interface IListOpts {
    prefix?: string
    limit?: number
}

type Catalog = {
    endpoints: Endpoint[]
    type: string
    id: string
    name: string
  }
  
type Endpoint = {
    id: string
    interface: string
    region: string
    region_id: string
    url: string
  }

export interface Container {
    objects: Object[]
}

export interface Object {
    name: string
}

export class SwiftClient {
    private token?: {id: string, catalog: Catalog[]}

    constructor(private identityEndpoint: string, private projectId: string, private username: string, private password: string) {
        try {
            this.token = JSON.parse(localStorage.getItem("openstack.token") || "") || undefined
        } catch (e) {
            // dummy
        }
    }

    async getToken(): Promise<void> {
        const resp = await fetch(`${this.identityEndpoint}/auth/tokens`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "auth": {
                    "identity": {
                        "methods": [
                            "password"
                        ],
                        "password": {
                            "user": {
                                "name": this.username,
                                "domain": {
                                    "name": "default"
                                },
                                "password": this.password
                            }
                        },
                        "scope": { "project": { "name": this.projectId, "domain": { "id": "default" } } }
                    }
                }
            })
        })
        if (resp.status !== 201) {
            const text = await resp.text()
            throw `fail to authenticate to keystone, status ${resp.status}: ${text}`
        }
        const content = await resp.json();
        const token = resp.headers.get("X-Subject-Token")
        if (!token) {
            throw `fail to authenticate to keystone, header X-Subject-Token not found`
        }

        this.token = {id : token, catalog: content.token.catalog}
        try {
            localStorage.setItem("openstack.token", JSON.stringify(this.token))
        } catch (e) {
            // dummy
        }
    }

    async fetch(region:string, path: string, queryParams?: { [key: string]: any },init?: RequestInit): Promise<Response> {
        if (!this.token) {
            await this.getToken()
        }
        if (!this.token) {
            throw "missing token"
        }

        if (!init) {
            init = {}
        }
        if (!init.headers) {
            init.headers = {}
        }

        const endpoints = this.token?.catalog.find(c => c.type === "object-store")
        if (!endpoints) {
            throw `no object-store endpoint found in user catalog`
        }
        const endpoint = endpoints.endpoints.find(e => e.interface === "public" && e.region === region)
        if (!endpoint) {
            throw `no endpoint found for region ${region}`
        }

        const url = new URL(endpoint.url+path)
        if (queryParams) {
            Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]))
        }

        const response = await fetch(url.toString(), {
            ...init, timeout: init.method === "POST"? undefined: 10000, headers: {
                "Content-Type": "application/json", "Accept": "application/json", "X-Auth-Token": this.token.id
                , ...init.headers
            }
        })
        await this.handleResponse(response)
        return response
    }


    async handleResponse(response: Response): Promise<Response> {
        if (response.status < 200 || response.status >= 300) {
            throw `Swift api returned an error with status ${response.status}: ${await response.text()}`
        }
        return response
    }

    async putObject(region: string, containerName: string, objectPath: string, content: Uint8Array, contentType: string): Promise<Object> {
        const response = await this.fetch(region, `/${encodeURIComponent(containerName)}/${objectPath}`, undefined, { body: content, method: "PUT", headers: { "Content-Type": contentType } })
        return {
            name: objectPath,
        }
    }

    async listObjects(region: string, containerName: string, listOpts: IListOpts): Promise<Container> {
        const response = await this.fetch(region,`/${encodeURIComponent(containerName)}`, listOpts)
        const objects = await response.json()
        return {
            objects
        }
    }

    async getObject(region:string, containerName: string, objectPath: string): Promise<Uint8Array> {
        const response = await this.fetch(region, `/${encodeURIComponent(containerName)}/${objectPath}`)
        return new Uint8Array(await response.arrayBuffer())
    }
}
