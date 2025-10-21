{
  "error": {
    "code": 400,
    "message": "Invalid JSON payload received. Unknown name \"additionalProperties\" at 'tools[0].function_declarations[0].parameters': Cannot find field.\nInvalid JSON payload received. Unknown name \"$schema\" at 'tools[0].function_declarations[0].parameters': Cannot find field.",
    "status": "INVALID_ARGUMENT",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        "fieldViolations": [
          {
            "field": "tools[0].function_declarations[0].parameters",
            "description": "Invalid JSON payload received. Unknown name \"additionalProperties\" at 'tools[0].function_declarations[0].parameters': Cannot find field."
          },
          {
            "field": "tools[0].function_declarations[0].parameters",
            "description": "Invalid JSON payload received. Unknown name \"$schema\" at 'tools[0].function_declarations[0].parameters': Cannot find field."
          }
        ]
      }
    ]
  }
}