FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY global.json ./
COPY Shared/ConnectHub.Shared/ConnectHub.Shared.csproj Shared/ConnectHub.Shared/
COPY ConnectHub.Gateway/ConnectHub.Gateway.csproj ConnectHub.Gateway/
RUN dotnet restore ConnectHub.Gateway/ConnectHub.Gateway.csproj

COPY Shared/ConnectHub.Shared/ Shared/ConnectHub.Shared/
COPY ConnectHub.Gateway/ ConnectHub.Gateway/

WORKDIR /src/ConnectHub.Gateway
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "ConnectHub.Gateway.dll"]
