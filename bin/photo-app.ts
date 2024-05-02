#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PhotoAppStack } from "../lib/photo-app-stack";

const app = new cdk.App();
new PhotoAppStack(app, "PhotoAppStack", {
  env: { region: "eu-west-1" },
});
