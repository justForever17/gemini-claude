# Implementation Plan

- [x] 1. Set up project structure and dependencies


  - Create package.json with Express, bcrypt, and necessary dependencies
  - Create directory structure (src/, data/, public/)
  - Initialize .gitignore for node_modules and data/config.json
  - _Requirements: 1.1, 1.4_

- [x] 2. Implement configuration management module

  - [x] 2.1 Create config.js with load/save functions


    - Implement JSON file read/write with atomic saves
    - Provide default values from environment variables
    - Handle missing config file gracefully
    - _Requirements: 1.2, 1.3_
  
  - [x] 2.2 Add configuration validation


    - Validate URL format for Gemini API endpoint
    - Ensure required fields are present
    - Generate initial local API key if missing
    - Set default Gemini model name if not provided
    - _Requirements: 3.2, 4.3, 10.5_

- [x] 3. Implement authentication module

  - [x] 3.1 Create auth.js with password hashing


    - Implement bcrypt password hashing and verification
    - Create session token generation function
    - Implement session storage with expiration
    - _Requirements: 2.2, 2.4, 6.2, 6.4_
  
  - [x] 3.2 Create authentication middleware


    - Implement session validation middleware
    - Implement API key validation middleware
    - Handle authentication errors with proper status codes
    - _Requirements: 2.3, 8.5_

- [x] 4. Implement API conversion module

  - [x] 4.1 Create proxy.js with Claude to Gemini conversion


    - Convert messages array (assistant → model, user → user)
    - Extract and convert system instruction
    - Map generation parameters (max_tokens, temperature, top_p, top_k, stop_sequences)
    - Implement buildGeminiUrl function to construct full API endpoint using configured model name
    - _Requirements: 8.1, 10.3, 10.4_
  
  - [x] 4.2 Implement Gemini to Claude response conversion


    - Extract content from candidates array
    - Map finish reasons (STOP → end_turn, MAX_TOKENS → max_tokens)
    - Convert usage metadata
    - Generate message ID in Claude format
    - _Requirements: 8.3, 8.4_
  
  - [x] 4.3 Implement streaming response conversion


    - Parse Gemini SSE events
    - Convert to Claude SSE format (message_start, content_block_delta, message_stop)
    - Handle stream completion and errors
    - Maintain proper SSE formatting
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 5. Create Express server with API endpoints

  - [x] 5.1 Initialize Express app in server.js


    - Set up Express with JSON body parser
    - Configure CORS for proxy endpoints
    - Serve static files from public/
    - _Requirements: 1.4_
  
  - [x] 5.2 Implement configuration API endpoints


    - POST /api/login - validate password and create session
    - GET /api/config - return current configuration including model name (requires session)
    - POST /api/config - update configuration including model name (requires session)
    - POST /api/test-connection - test Gemini API connectivity (requires session)
    - POST /api/generate-key - generate new local API key (requires session)
    - POST /api/change-password - change admin password (requires session)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3, 3.5, 4.2, 4.3, 5.2, 6.1, 6.3, 6.4, 6.5, 10.2_
  
  - [x] 5.3 Implement proxy endpoint


    - POST /v1/messages - proxy Claude API requests to Gemini
    - Validate local API key from Authorization header
    - Convert request format using proxy.js
    - Build full Gemini API URL using configured base URL and model name
    - Forward to constructed Gemini API endpoint
    - Convert and return response
    - Handle both streaming and non-streaming modes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 10.3, 10.4_

- [x] 6. Build configuration UI

  - [x] 6.1 Create HTML structure in index.html


    - Create login card with password input
    - Create configuration card with all settings sections
    - Add theme toggle button
    - Add connectivity indicator element
    - Add Gemini model name input field
    - _Requirements: 2.1, 10.1, 11.1, 11.4_
  
  - [x] 6.2 Implement CSS styling in styles.css


    - Define CSS variables for light and dark themes
    - Style card with 30px border-radius and neumorphic shadows
    - Implement responsive design
    - Style form inputs, buttons, and indicators
    - Create light theme (#e8e8e8 background) and dark theme (#212121 background)
    - _Requirements: 7.2, 7.3, 11.2, 11.3, 11.5_
  
  - [x] 6.3 Implement frontend logic in app.js


    - Implement login form submission
    - Load and display current configuration including model name
    - Handle configuration form submission with model name
    - Implement theme toggle with localStorage persistence
    - Implement connectivity test with status indicator
    - Implement API key generation
    - Implement password change functionality
    - Handle session management and logout
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.4, 7.5, 10.1, 10.2_

- [x] 7. Create Docker configuration

  - [x] 7.1 Write Dockerfile


    - Use node:20-alpine base image
    - Copy package files and install production dependencies
    - Copy source code
    - Create non-root user
    - Expose port 9000
    - Set up volume mount point for /app/data
    - _Requirements: 1.1, 1.3_
  
  - [x] 7.2 Create docker-compose.yml


    - Define service with port mapping
    - Configure volume mount for data persistence
    - Set environment variables for initial configuration including model name
    - _Requirements: 1.2, 1.3, 10.5_
  
  - [x] 7.3 Create .dockerignore


    - Exclude node_modules, data/, and development files
    - _Requirements: 1.1_


- [x] 8. Add error handling and logging


  - [ ] 8.1 Implement error handling middleware
    - Catch and format errors consistently
    - Return appropriate HTTP status codes
    - Log errors with context


    - _Requirements: 8.5_
  
  - [x] 8.2 Add request logging


    - Log incoming proxy requests (without sensitive data)


    - Log configuration changes
    - Log authentication attempts
    - _Requirements: 2.3, 6.4_

- [x] 9. Create documentation


  - [ ] 9.1 Write README.md
    - Document installation and deployment steps
    - Explain environment variables
    - Provide configuration instructions for Claude clients
    - Include troubleshooting section
    - _Requirements: 1.1, 1.2_
  
  - [ ] 9.2 Add inline code comments
    - Document complex conversion logic
    - Explain security considerations
    - Add JSDoc comments for public functions
    - _Requirements: All_

- [ ] 10. Integration and deployment testing
  - [ ] 10.1 Test Docker build and deployment
    - Build Docker image
    - Run container with environment variables
    - Verify port 9000 is accessible
    - Test volume persistence across restarts
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ] 10.2 Test configuration UI end-to-end
    - Test login with correct and incorrect passwords
    - Test theme switching and persistence
    - Test configuration save and load including model name
    - Test connectivity indicator
    - Test API key generation
    - Test password change
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 10.1, 10.2_
  
  - [ ] 10.3 Test proxy functionality
    - Send test Claude API request through proxy
    - Verify request is converted and forwarded to correct model endpoint
    - Verify response is converted back correctly
    - Test streaming responses
    - Test with invalid API key
    - Test with different model names
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 10.3, 10.4_
