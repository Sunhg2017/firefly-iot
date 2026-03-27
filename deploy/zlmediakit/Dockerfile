FROM ubuntu:20.04 AS build
ARG MODEL=Release

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai

# Pin to the ZLMediaKit 8.0 stable line because the current Docker Hub
# master image requires cookie login and breaks Firefly's secret-based REST calls.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      curl \
      gcc \
      g++ \
      gdb \
      git \
      libssl-dev \
      tzdata \
      vim \
      wget && \
    apt-get autoremove -y && \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/media
COPY vendor/ZLMediaKit-588d9de.tar.gz /tmp/vendor/
COPY vendor/ZLToolKit-6e72744.tar.gz /tmp/vendor/
COPY vendor/jsoncpp-69098a1.tar.gz /tmp/vendor/
COPY vendor/media-server-447e3b8.tar.gz /tmp/vendor/
COPY vendor/libsrtp-2.3.0.tar.gz /tmp/vendor/

RUN set -eux; \
    tar -xzf /tmp/vendor/ZLMediaKit-588d9de.tar.gz -C /opt/media; \
    mv /opt/media/ZLMediaKit-* /opt/media/ZLMediaKit; \
    rm -rf /opt/media/ZLMediaKit/3rdpart/ZLToolKit /opt/media/ZLMediaKit/3rdpart/jsoncpp /opt/media/ZLMediaKit/3rdpart/media-server; \
    tar -xzf /tmp/vendor/ZLToolKit-6e72744.tar.gz -C /opt/media/ZLMediaKit/3rdpart; \
    mv /opt/media/ZLMediaKit/3rdpart/ZLToolKit-* /opt/media/ZLMediaKit/3rdpart/ZLToolKit; \
    tar -xzf /tmp/vendor/jsoncpp-69098a1.tar.gz -C /opt/media/ZLMediaKit/3rdpart; \
    mv /opt/media/ZLMediaKit/3rdpart/jsoncpp-* /opt/media/ZLMediaKit/3rdpart/jsoncpp; \
    tar -xzf /tmp/vendor/media-server-447e3b8.tar.gz -C /opt/media/ZLMediaKit/3rdpart; \
    mv /opt/media/ZLMediaKit/3rdpart/media-server-* /opt/media/ZLMediaKit/3rdpart/media-server; \
    mkdir -p /opt/media/ZLMediaKit/build "/opt/media/ZLMediaKit/release/linux/${MODEL}/"

WORKDIR /opt/media/ZLMediaKit/3rdpart
RUN cp /tmp/vendor/libsrtp-2.3.0.tar.gz libsrtp-2.3.0.tar.gz && \
    tar xfv libsrtp-2.3.0.tar.gz && \
    mv libsrtp-2.3.0 libsrtp && \
    cd libsrtp && ./configure --enable-openssl && make -j "$(nproc)" && make install

WORKDIR /opt/media/ZLMediaKit/build
RUN cmake -DCMAKE_BUILD_TYPE=${MODEL} -DENABLE_WEBRTC=true -DENABLE_FFMPEG=true -DENABLE_TESTS=false -DENABLE_API=false .. && \
    make -j "$(nproc)"

FROM ubuntu:20.04
ARG MODEL=Release

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      gcc \
      g++ \
      gdb \
      libssl-dev \
      tzdata \
      vim \
      wget && \
    apt-get autoremove -y && \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/*

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    mkdir -p /opt/media/bin/www /opt/media/conf

WORKDIR /opt/media/bin
COPY --from=build /opt/media/ZLMediaKit/release/linux/${MODEL}/MediaServer /opt/media/bin/
COPY --from=build /opt/media/ZLMediaKit/default.pem /opt/media/bin/
COPY --from=build /opt/media/ZLMediaKit/release/linux/${MODEL}/config.ini /opt/media/conf/
COPY --from=build /opt/media/ZLMediaKit/www/ /opt/media/bin/www/

EXPOSE 80 443 554 1935 10000/tcp 10000/udp
ENV PATH=/opt/media/bin:${PATH}
CMD ["./MediaServer", "-s", "default.pem", "-c", "../conf/config.ini", "-l", "0"]
