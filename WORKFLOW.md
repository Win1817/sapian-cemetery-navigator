# Application Workflows

This document outlines the user and administrator workflows based on the User Guide.

### User Workflow

This flowchart illustrates the primary paths a user can take through the application.

```
[START]
   |
   v
[Open Application] --> (Are you logged in?)
   |         |
 (Yes)     (No)
   |         |
   v         v
[Main Map Page]   [Sign In Page] --> [Enter Credentials] --> [Main Map Page]
   |
   +----------------------------------------------------------+
   |                                                          |
   v                                                          v
[Find a Grave]                                     (Is user an Admin?) --(Yes)--> [Go to Admin Flow]
   |
   +-----------------------+-----------------------+
   |                       |                       |
   v                       v                       v
[Use Search Bar] --> [Select from Results]  [Explore Map] --> [Click on a Grave Marker]
   |                                               |
   +-----------------------+-----------------------+
                           |
                           v
                     [Grave is Selected]
                           |
                           v
                  [View Grave Details]
                           |
                           v
      (Do you want navigation?) --(Yes)--> [Enable Location] --> [Route is Drawn on Map]
                           |
                          (No)
                           |
                           v
                        [END]
```

### Administrator Workflow

This flowchart shows the specific actions available to an administrator.

```
[START: From Main Map Page]
   |
   v
[Click "Administrator" Button]
   |
   v
[Admin Dashboard]
   |
   +----------------------+----------------------+----------------------+----------------------------+
   |                      |                      |                      |                            |
   v                      v                      v                      v                            v
[Draw New Grave Lot]  [Add/Edit Grave Details] [Upload Grave Image]  [View/Search All Graves]     [Manage User Roles]
   |                      |                      |                      |                            |
   +----------------------+----------------------+----------------------+----------------------------+
                          |
                          v
                       [END]

```
