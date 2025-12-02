# Steps to reproduce

1. `docker compose up -d`
2. `npm test`

## Notes

1. The problem seems to happend when having 3 entities that are related 1:M 1:M
2. The leaf entity needs to have an embeddable with a shadow property
3. The shadow property is used in query instead of correctly being ignored because it should not be persisted