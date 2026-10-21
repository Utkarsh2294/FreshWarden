# Generated route access table

Run `node tools/route-table.js`. Roles come from the actual Express middleware, not a second handwritten policy. Authenticated routes without an explicit role list still enforce assigned-store access in their handlers. The development simulator is absent in production.

| Method | Route                                              | Authentication                   | Roles                                  |
| ------ | -------------------------------------------------- | -------------------------------- | -------------------------------------- |
| GET    | `/metrics`                                         | JWT                              | admin                                  |
| GET    | `/health`                                          | Public or device/link credential | Handler/store checks                   |
| POST   | `/api/auth/login`                                  | Public or device/link credential | Handler/store checks                   |
| GET    | `/api/me`                                          | JWT                              | Handler/store checks                   |
| GET    | `/api/inspector/:token([a-f0-9]{64})`              | Public or device/link credential | Handler/store checks                   |
| GET    | `/api/inspector/:token([a-f0-9]{64})/evidence/:id` | Public or device/link credential | Handler/store checks                   |
| POST   | `/api/telemetry`                                   | Public or device/link credential | Handler/store checks                   |
| POST   | `/api/sensors`                                     | JWT                              | manager, admin                         |
| POST   | `/api/sensors/:id/rotate-key`                      | JWT                              | manager, admin                         |
| GET    | `/api/zones/:zoneId/readings`                      | JWT                              | Handler/store checks                   |
| POST   | `/api/coldchain/simulate`                          | JWT                              | manager, admin                         |
| POST   | `/api/stores`                                      | JWT                              | admin                                  |
| PATCH  | `/api/stores/:id/zones/:zoneId`                    | JWT                              | manager, admin                         |
| GET    | `/api/rules`                                       | JWT                              | manager, area, admin                   |
| POST   | `/api/rules`                                       | JWT                              | admin                                  |
| GET    | `/api/stores`                                      | JWT                              | Handler/store checks                   |
| GET    | `/api/stores/:id/overview`                         | JWT                              | Handler/store checks                   |
| GET    | `/api/lots`                                        | JWT                              | receiver, picker, manager, area, admin |
| POST   | `/api/catalog/import`                              | JWT                              | admin                                  |
| GET    | `/api/catalog/lookup`                              | JWT                              | Handler/store checks                   |
| GET    | `/api/evidence/:id`                                | JWT                              | receiver, manager, area, admin         |
| GET    | `/api/inward`                                      | JWT                              | receiver, manager, area, admin         |
| POST   | `/api/inward/verify`                               | JWT                              | receiver, manager, admin               |
| POST   | `/api/inward/:id/confirm`                          | JWT                              | receiver, manager, admin               |
| POST   | `/api/shelf/scan`                                  | JWT                              | receiver, manager, admin               |
| GET    | `/api/shelf`                                       | JWT                              | receiver, manager, area, admin         |
| PATCH  | `/api/shelf/:id/findings/:index`                   | JWT                              | manager, admin                         |
| GET    | `/api/incidents`                                   | JWT                              | receiver, manager, area, admin         |
| POST   | `/api/incidents`                                   | JWT                              | receiver, manager, admin               |
| PATCH  | `/api/incidents/:id/capa`                          | JWT                              | manager, admin                         |
| PATCH  | `/api/incidents/:id/dismiss`                       | JWT                              | manager, admin                         |
| POST   | `/api/dispatch/check`                              | JWT                              | picker, manager, admin                 |
| POST   | `/api/dispatch/override`                           | JWT                              | manager, admin                         |
| POST   | `/api/dispatch/pack`                               | JWT                              | picker, manager, admin                 |
| GET    | `/api/stores/:id/health`                           | JWT                              | manager, area, admin                   |
| GET    | `/api/network/health`                              | JWT                              | area, admin                            |
| GET    | `/api/reports/daily`                               | JWT                              | manager, area, admin                   |
| GET    | `/api/inspector/links`                             | JWT                              | manager, admin                         |
| POST   | `/api/inspector/links`                             | JWT                              | manager, admin                         |
| DELETE | `/api/inspector/links/:id`                         | JWT                              | manager, admin                         |
