# Requirements Document

## Introduction

Gemini-Claude is a local API proxy service that converts third-party Gemini API requests into Claude-compatible format for use with Claude Code and Claude VSCode plugins. The system runs as a Docker container on port 9000 and provides a web-based configuration interface for managing API endpoints, authentication, and connectivity monitoring.

## Glossary

- **Proxy Service**: The core API conversion service that translates between Gemini and Claude API formats
- **Configuration Interface**: A web-based UI for managing proxy settings and credentials
- **Third-Party Gemini API**: External Gemini API endpoint (e.g., https://ooyqluonsaqr.ap-southeast-1.clawcloudrun.com)
- **Downstream Client**: Applications like Claude Code or Claude VSCode plugin that consume the proxy API
- **Connectivity Indicator**: Visual status indicator showing API connection health (red/green)
- **Admin Password**: Authentication credential required to access the configuration interface
- **Local API Key**: Generated authentication token for downstream clients to use the proxy

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to deploy the proxy service as a Docker container, so that I can easily manage and isolate the service

#### Acceptance Criteria

1. THE Proxy Service SHALL run as a Docker container on port 9000
2. THE Proxy Service SHALL accept environment variables for Third-Party Gemini API URL, API key, and Admin Password
3. THE Proxy Service SHALL persist configuration data across container restarts
4. THE Proxy Service SHALL expose HTTP endpoints for both API proxying and configuration management

### Requirement 2

**User Story:** As a system administrator, I want to access a password-protected configuration interface, so that unauthorized users cannot modify proxy settings

#### Acceptance Criteria

1. WHEN a user navigates to the configuration interface, THE Configuration Interface SHALL display a login form
2. THE Configuration Interface SHALL validate the Admin Password against the configured credential
3. IF the Admin Password is incorrect, THEN THE Configuration Interface SHALL display an error message and deny access
4. WHEN authentication succeeds, THE Configuration Interface SHALL display the configuration panel
5. THE Configuration Interface SHALL maintain the authenticated session until the user logs out or the session expires

### Requirement 3

**User Story:** As a system administrator, I want to configure the third-party Gemini API endpoint, so that the proxy can connect to different API providers

#### Acceptance Criteria

1. THE Configuration Interface SHALL provide an input field for the Third-Party Gemini API URL
2. THE Configuration Interface SHALL validate that the URL follows proper format (https://)
3. WHEN the URL is updated, THE Configuration Interface SHALL save the new value to persistent storage
4. THE Configuration Interface SHALL provide an input field for the Third-Party Gemini API key
5. WHEN the API key is updated, THE Configuration Interface SHALL save the new value to persistent storage

### Requirement 4

**User Story:** As a system administrator, I want to generate and view a local API key, so that downstream clients can authenticate with the proxy

#### Acceptance Criteria

1. THE Configuration Interface SHALL display the current Local API Key
2. THE Configuration Interface SHALL provide a button to generate a new Local API Key
3. WHEN the generate button is clicked, THE Configuration Interface SHALL create a cryptographically secure random key
4. THE Configuration Interface SHALL save the generated Local API Key to persistent storage
5. THE Proxy Service SHALL validate incoming requests against the configured Local API Key

### Requirement 5

**User Story:** As a system administrator, I want to see real-time connectivity status, so that I can verify the proxy can reach the third-party API

#### Acceptance Criteria

1. THE Configuration Interface SHALL display a Connectivity Indicator (red or green)
2. WHEN both the Third-Party Gemini API URL and API key are configured, THE Configuration Interface SHALL test connectivity to the Third-Party Gemini API
3. IF the connectivity test succeeds, THEN THE Connectivity Indicator SHALL display green
4. IF the connectivity test fails, THEN THE Connectivity Indicator SHALL display red
5. THE Configuration Interface SHALL perform connectivity test only once after URL and API key configuration is complete

### Requirement 6

**User Story:** As a system administrator, I want to change the admin password, so that I can maintain security of the configuration interface

#### Acceptance Criteria

1. THE Configuration Interface SHALL provide input fields for current password and new password
2. THE Configuration Interface SHALL validate that the current password matches the stored Admin Password
3. IF the current password is incorrect, THEN THE Configuration Interface SHALL display an error message
4. WHEN the password change succeeds, THE Configuration Interface SHALL save the new Admin Password to persistent storage
5. THE Configuration Interface SHALL require re-authentication after password change

### Requirement 7

**User Story:** As a system administrator, I want to switch between light and dark themes, so that I can use the interface comfortably in different lighting conditions

#### Acceptance Criteria

1. THE Configuration Interface SHALL provide a theme toggle control
2. THE Configuration Interface SHALL support light theme with background color #e8e8e8
3. THE Configuration Interface SHALL support dark theme with background color #212121
4. WHEN the theme toggle is activated, THE Configuration Interface SHALL switch between light and dark themes
5. THE Configuration Interface SHALL persist the selected theme preference in browser storage

### Requirement 8

**User Story:** As a downstream client, I want to send Anthropic Claude API requests to the proxy, so that they are converted to Gemini format and forwarded

#### Acceptance Criteria

1. WHEN a POST request is sent to /v1/messages with valid Local API Key, THE Proxy Service SHALL convert the request to Gemini format
2. THE Proxy Service SHALL forward the converted request to the configured Third-Party Gemini API
3. THE Proxy Service SHALL convert the Gemini response back to Anthropic Claude format
4. THE Proxy Service SHALL return the converted response to the Downstream Client
5. IF the Local API Key is invalid, THEN THE Proxy Service SHALL return a 401 Unauthorized response

### Requirement 9

**User Story:** As a downstream client, I want streaming responses to work correctly, so that I can receive real-time token generation

#### Acceptance Criteria

1. WHEN a streaming request is sent with stream parameter set to true, THE Proxy Service SHALL enable streaming mode
2. THE Proxy Service SHALL convert Gemini SSE events to Anthropic SSE format
3. THE Proxy Service SHALL stream response chunks as they arrive from the Third-Party Gemini API
4. THE Proxy Service SHALL properly handle stream completion and error events
5. THE Proxy Service SHALL maintain proper SSE formatting throughout the stream

### Requirement 10

**User Story:** As a system administrator, I want to configure the default Gemini model name, so that I can control which model is used for API requests

#### Acceptance Criteria

1. THE Configuration Interface SHALL provide an input field for the Gemini model name
2. THE Configuration Interface SHALL save the configured model name to persistent storage
3. THE Proxy Service SHALL use the configured model name when constructing Gemini API request URLs
4. THE Proxy Service SHALL construct the full API endpoint by combining the Gemini API URL with the model name
5. IF no model name is configured, THE Proxy Service SHALL use "gemini-1.5-pro-latest" as the default

### Requirement 11

**User Story:** As a developer, I want the configuration interface to use a card-based design, so that settings are organized and visually appealing

#### Acceptance Criteria

1. THE Configuration Interface SHALL display all configuration options within a centered card component
2. THE card component SHALL use border-radius of 30px and neumorphic shadow styling
3. THE Configuration Interface SHALL adapt card styling to the selected theme (light/dark)
4. THE Configuration Interface SHALL organize settings into logical sections within the card
5. THE Configuration Interface SHALL ensure the card is responsive and properly sized for typical screen resolutions
