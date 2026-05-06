FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY global.json ./
COPY Shared/ConnectHub.Shared/ConnectHub.Shared.csproj Shared/ConnectHub.Shared/
COPY Services/ConnectHub.Hub.API/ConnectHub.Hub.API.csproj Services/ConnectHub.Hub.API/
RUN dotnet restore Services/ConnectHub.Hub.API/ConnectHub.Hub.API.csproj

COPY Shared/ConnectHub.Shared/ Shared/ConnectHub.Shared/
COPY Services/ConnectHub.Hub.API/ Services/ConnectHub.Hub.API/

WORKDIR /src/Services/ConnectHub.Hub.API
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "ConnectHub.Hub.API.dll"]
