/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi
    setDebug(debug: boolean): void
  }

  export class AdAccount {
    constructor(id: string)
    getInsights(fields: string[], params: Record<string, unknown>): Promise<any[]>
    read(fields: string[]): Promise<any>
  }

  export class Ad {
    constructor(id: string)
    getInsights(fields: string[], params: Record<string, unknown>): Promise<any[]>
    static Fields: Record<string, string>
  }

  export class AdSet {
    constructor(id: string)
    static Fields: Record<string, string>
  }

  export class Campaign {
    constructor(id: string)
    static Fields: Record<string, string>
  }

  export class AdImage {
    static Fields: Record<string, string>
  }

  export class AdVideo {
    constructor(id: string | null, parentId?: string)
    static Fields: Record<string, string>
  }

  export class AdCreative {
    static Fields: Record<string, string>
  }

  export class AdsInsights {
    static Fields: Record<string, string>
  }

  const bizSdk: {
    FacebookAdsApi: typeof FacebookAdsApi
    AdAccount: typeof AdAccount
    Ad: typeof Ad
    AdSet: typeof AdSet
    Campaign: typeof Campaign
    AdImage: typeof AdImage
    AdVideo: typeof AdVideo
    AdCreative: typeof AdCreative
    AdsInsights: typeof AdsInsights
  }

  export default bizSdk
}
