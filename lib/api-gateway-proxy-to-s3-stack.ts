import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  aws_s3 as s3,
  aws_apigateway as apigateway,
  aws_lambda_nodejs as lambda,
  aws_iam as iam
} from "aws-cdk-lib";

export class ApiGatewayProxyToS3Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const projectName: string = this.node.tryGetContext("projectName");

    // Lambda
    new lambda.NodejsFunction(this, "MyLambda", {
      entry: "lambda/app.ts",
      handler: "lambdaHandler",
    });

    // S3
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${projectName}-bucket`,
    });

    // API Gateway
    const restApiRole = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      path: "/",
    });
    bucket.grantReadWrite(restApiRole);

    // REST API
    const restApi = new apigateway.RestApi(this, "RestApi", {
      restApiName: `${projectName}-api`,
      deployOptions: {
        stageName: "v1",
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["POST", "OPTIONS", "PUT", "DELETE"],
        statusCode: 200,
      },
      binaryMediaTypes: ["image/*"],
    });

    const users = restApi.root.addResource("users");
    const userId = users.addResource("{userId}");
    const files = userId.addResource("files");
    const fileName = files.addResource("{fileName}");

    const integrationResponseParametersOfCors = {
      "method.response.header.Access-Control-Allow-Headers":
        "'Content-Type,Authorization'",
      "method.response.header.Access-Control-Allow-Methods":
        "'OPTIONS,POST,PUT,GET,DELETE'",
      "method.response.header.Access-Control-Allow-Origin": "'*'",
    };

    const integrationResponses = [
      {
        statusCode: "200",
        responseParameters: {
          "method.response.header.Timestamp":
            "integration.response.header.Date",
          "method.response.header.Content-Length":
            "integration.response.header.Content-Length",
          "method.response.header.Content-Type":
            "integration.response.header.Content-Type",
          ...integrationResponseParametersOfCors,
        },
      },
      {
        statusCode: "400",
        selectionPattern: "4\\d{2}",
        responseParameters: integrationResponseParametersOfCors,
      },
      {
        statusCode: "500",
        selectionPattern: "5\\d{2}",
        responseParameters: integrationResponseParametersOfCors,
      },
    ];

    const methodResponseParametersOfCors = {
      "method.response.header.Access-Control-Allow-Headers": true,
      "method.response.header.Access-Control-Allow-Methods": true,
      "method.response.header.Access-Control-Allow-Origin": true,
    };

    const methodResponses = [
      {
        statusCode: "200",
        responseParameters: {
          "method.response.header.Timestamp": true,
          "method.response.header.Content-Length": true,
          "method.response.header.Content-Type": true,
          ...methodResponseParametersOfCors,
        },
      },
      {
        statusCode: "400",
        responseParameters: methodResponseParametersOfCors,
      },
      {
        statusCode: "500",
        responseParameters: methodResponseParametersOfCors,
      },
    ];

    files.addMethod(
      "GET",
      new apigateway.AwsIntegration({
        service: "s3",
        integrationHttpMethod: "GET",
        path: bucket.bucketName,
        options: {
          credentialsRole: restApiRole,
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
          integrationResponses,
          requestTemplates: {
            "application/json": `#set($context.requestOverride.querystring.prefix = "$input.params('userId')/")
#set($context.requestOverride.querystring.delimiter = "/")`,
          },
        },
      }),
      { methodResponses }
    );

    fileName.addMethod(
      "GET",
      new apigateway.AwsIntegration({
        service: "s3",
        integrationHttpMethod: "GET",
        path: `${bucket.bucketName}/{folder}/{object}`,
        options: {
          credentialsRole: restApiRole,
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
          requestParameters: {
            "integration.request.header.Accept": "method.request.header.Accept",
            "integration.request.path.folder": "method.request.path.userId",
            "integration.request.path.object": "method.request.path.fileName",
          },
          integrationResponses,
        },
      }),
      {
        requestParameters: {
          "method.request.header.Accept": true,
          "method.request.path.userId": true,
          "method.request.path.fileName": true,
        },
        methodResponses,
      }
    );

    fileName.addMethod(
      "PUT",
      new apigateway.AwsIntegration({
        service: "s3",
        integrationHttpMethod: "PUT",
        path: `${bucket.bucketName}/{folder}/{object}`,
        options: {
          credentialsRole: restApiRole,
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
          requestParameters: {
            "integration.request.header.Content-Type":
              "method.request.header.Content-Type",
            "integration.request.path.folder": "method.request.path.userId",
            "integration.request.path.object": "method.request.path.fileName",
          },
          integrationResponses,
        },
      }),
      {
        requestParameters: {
          "method.request.header.Content-Type": true,
          "method.request.path.userId": true,
          "method.request.path.fileName": true,
        },
        methodResponses,
      }
    );

    fileName.addMethod(
      "DELETE",
      new apigateway.AwsIntegration({
        service: "s3",
        integrationHttpMethod: "DELETE",
        path: `${bucket.bucketName}/{folder}/{object}`,
        options: {
          credentialsRole: restApiRole,
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
          requestParameters: {
            "integration.request.path.folder": "method.request.path.userId",
            "integration.request.path.object": "method.request.path.fileName",
          },
          integrationResponses,
        },
      }),
      {
        requestParameters: {
          "method.request.path.userId": true,
          "method.request.path.fileName": true,
        },
        methodResponses,
      }
    );
  }
}
