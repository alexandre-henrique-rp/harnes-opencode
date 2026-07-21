declare module "@opencode-ai/plugin" {
  export const tool: any;
  export type Plugin = any;
}

declare module "@aws-sdk/client-s3" {
  export type S3Client = any;
  export const S3Client: any;
  export const GetObjectCommand: any;
  export const PutObjectCommand: any;
  export const CreateBucketCommand: any;
  export const HeadBucketCommand: any;
  export const DeleteObjectCommand: any;
  export const CopyObjectCommand: any;
}
declare module "@aws-sdk/lib-storage";
declare module "@aws-sdk/s3-request-presigner";
declare module "clamdjs";


