FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build

ARG TARGETARCH
ARG TARGETOS

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOARCH=$TARGETARCH GOOS=$TARGETOS go build \
  -trimpath \
  -ldflags="-s -w" \
  -o /out/profile-service \
  ./cmd/server

FROM alpine:3.23

RUN apk add --no-cache ca-certificates \
  && addgroup -S app \
  && adduser -S -G app app

COPY --from=build /out/profile-service /usr/local/bin/profile-service

USER app
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/profile-service"]
